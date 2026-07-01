#!/usr/bin/env node
/**
 * Records a mobile PWA-style BigByte demo to demo/bigbyte-demo.webm
 *
 * Prerequisites:
 *   python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
 *   npm --prefix frontend run dev
 *
 * Then: cd e2e && npm install && npm run install-browser && npm run record-demo
 */
import { execSync } from 'node:child_process'
import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import { joinGuestAndSubmit, waitForServers } from './demo-api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DEMO_DIR = path.join(REPO_ROOT, 'demo')
const OUTPUT_WEBM = path.join(DEMO_DIR, 'bigbyte-demo.webm')
const OUTPUT_MP4 = path.join(DEMO_DIR, 'bigbyte-demo.mp4')

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8000'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const PAUSE_MS = Number(process.env.DEMO_PAUSE_MS || 2000)
const SHORT_PAUSE_MS = Number(process.env.DEMO_SHORT_PAUSE_MS || 700)

// 9:16 vertical — sharp on YouTube / phone (Playwright defaults scale down to 800px if unset)
const VIDEO_WIDTH = 1080
const VIDEO_HEIGHT = 1920

const PHONE = devices['iPhone 14 Pro Max']

function groupIdFromUrl(url) {
  const hash = new URL(url).hash.replace(/^#/, '')
  const parts = hash.split('/').filter(Boolean)
  if (parts[0] === 'questionnaire' && parts[1]) return parts[1]
  if (parts[0] === 'join' && parts[1]) return parts[1]
  return null
}

async function pause(page, ms = PAUSE_MS) {
  await page.waitForTimeout(ms)
}

async function scrollTop(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
}

async function tap(page, locator, options = {}) {
  const target = typeof locator === 'string' ? page.locator(locator) : locator
  await target.scrollIntoViewIfNeeded()
  await pause(page, SHORT_PAUSE_MS)
  await target.click({ ...options })
}

function convertToMp4(webmPath, mp4Path) {
  let ffmpeg = 'ffmpeg'
  try {
    ffmpeg = execSync('which ffmpeg', { encoding: 'utf8' }).trim()
  } catch {
    return false
  }
  if (!ffmpeg) return false
  try {
    execSync(
      `"${ffmpeg}" -y -i "${webmPath}" -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`,
      { stdio: 'pipe' },
    )
    return true
  } catch {
    return false
  }
}

async function main() {
  await waitForServers(API_BASE, FRONTEND_URL)
  await mkdir(DEMO_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  })

  const context = await browser.newContext({
    ...PHONE,
    locale: 'en-US',
    colorScheme: 'dark',
    recordVideo: {
      dir: DEMO_DIR,
      size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    },
  })

  const page = await context.newPage()

  try {
    // Landing
    await page.goto(`${FRONTEND_URL}/#/`, { waitUntil: 'networkidle' })
    await scrollTop(page)
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Create group' }))
    await page.waitForSelector('.landing__code-area code')
    await tap(page, '.landing__code-area code')
    await pause(page)
    await tap(page, page.getByRole('button', { name: /Continue to group/ }))
    await page.waitForURL(/#\/questionnaire\//)

    // Step 1 — commute
    await scrollTop(page)
    await page.waitForSelector('text=Where I am')
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Mission District', exact: true }))
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Next' }))
    await page.waitForURL(/\/2/)

    // Step 2 — cuisine
    await scrollTop(page)
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Indian', exact: true }))
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Next' }))
    await page.waitForURL(/\/3/)

    // Step 3 — budget
    await scrollTop(page)
    await pause(page)
    await tap(page, page.getByRole('checkbox', { name: '$$', exact: true }))
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Next' }))
    await page.waitForURL(/\/plan/)

    // Step 4 — plan
    await scrollTop(page)
    await pause(page)
    await tap(page, page.getByRole('radio', { name: /Sit down/ }))
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Next' }))
    await page.waitForURL(/\/8/)

    // Step 5 — vibe
    await scrollTop(page)
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Casual', exact: true }))
    await pause(page)
    await tap(page, page.getByRole('button', { name: 'Next' }))
    await page.waitForURL(/\/results/)

    // Waiting → friend joins via API → live SSE
    await scrollTop(page)
    await page.waitForSelector('text=Waiting for the group', { timeout: 30000 })
    await pause(page)

    const groupId = groupIdFromUrl(page.url())
    if (!groupId) throw new Error('Could not parse group id from URL')

    await joinGuestAndSubmit(API_BASE, groupId)
    await pause(page)

    // Recommendations
    await page.waitForSelector('.rec-card', { timeout: 120000 })
    await scrollTop(page)
    await pause(page)

    const firstCard = page.locator('.rec-card').first()
    await tap(page, firstCard)
    await pause(page)
    await tap(page, firstCard.getByRole('button', { name: 'Yes' }))
    await pause(page)

    await tap(page, page.locator('.rec-sticky-pick button'))
    await page.waitForSelector('.rec-winner', { timeout: 15000 })
    await scrollTop(page)
    await pause(page, 2500)
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    if (video) {
      const tempPath = await video.path()
      await rename(tempPath, OUTPUT_WEBM)
    }
  }

  console.log(`Demo saved to ${OUTPUT_WEBM} (${VIDEO_WIDTH}×${VIDEO_HEIGHT} mobile)`)

  if (convertToMp4(OUTPUT_WEBM, OUTPUT_MP4)) {
    console.log(`MP4 copy saved to ${OUTPUT_MP4} (optional — YouTube also accepts .webm)`)
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
