#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const deviceId = process.argv[2]
const adbArgs = []
if (deviceId != null && deviceId.length > 0) {
	adbArgs.push('-s', deviceId)
}
adbArgs.push('logcat', '-d', '-v', 'threadtime', 'JSConsole:D', 'RichTextJNI:W', '*:S')

const result = spawnSync('adb', adbArgs, {
	encoding: 'utf8',
	maxBuffer: 20 * 1024 * 1024
})

if (result.error != null) {
	console.error(`无法执行 adb: ${result.error.message}`)
	process.exit(1)
}
if (result.status !== 0) {
	console.error(result.stderr.trim())
	process.exit(result.status ?? 1)
}

function createPhase(name) {
	return {
		name,
		result: '',
		copyCount: 0,
		copyTotalMs: 0,
		copyMaxMs: 0,
		copyBytes: 0,
		snapshotCount: 0,
		snapshotTotalMs: 0,
		snapshotMaxMs: 0
	}
}

const phases = {
	fixed: createPhase('fixed'),
	updating: createPhase('updating')
}
let activePhase = null

for (const line of result.stdout.split('\n')) {
	if (line.includes('[RichTextPerfRepro] fixed-start')) {
		phases.fixed = createPhase('fixed')
		activePhase = phases.fixed
		continue
	}
	if (line.includes('[RichTextPerfRepro] updating-start')) {
		phases.updating = createPhase('updating')
		activePhase = phases.updating
		continue
	}

	const resultMatch = line.match(/\[RichTextPerfRepro\] (fixed|updating)(?:---COMMA---|,)\s*(.+?)\s+at\s+/)
	if (resultMatch != null) {
		phases[resultMatch[1]].result = resultMatch[2]
		activePhase = null
		continue
	}
	if (activePhase == null) continue

	const copyMatch = line.match(/Tile RGBA->Bitmap copy:\s*([\d.]+)ms.*size=(\d+)x(\d+)/)
	if (copyMatch != null) {
		const duration = Number(copyMatch[1])
		const width = Number(copyMatch[2])
		const height = Number(copyMatch[3])
		activePhase.copyCount++
		activePhase.copyTotalMs += duration
		activePhase.copyMaxMs = Math.max(activePhase.copyMaxMs, duration)
		activePhase.copyBytes += width * height * 4
		continue
	}

	const snapshotMatch = line.match(/BuildTileSnapshotList:\s*([\d.]+)ms/)
	if (snapshotMatch != null) {
		const duration = Number(snapshotMatch[1])
		activePhase.snapshotCount++
		activePhase.snapshotTotalMs += duration
		activePhase.snapshotMaxMs = Math.max(activePhase.snapshotMaxMs, duration)
	}
}

if (phases.fixed.result.length == 0 || phases.updating.result.length == 0) {
	console.error('没有找到完整的 fixed-start/result 和 updating-start/result 边界；请先运行完整 F01 对照。')
	process.exit(2)
}

function formatPhase(phase) {
	return [
		`${phase.name}: ${phase.result}`,
		`  bitmap copy: count=${phase.copyCount}, total=${phase.copyTotalMs.toFixed(2)}ms, max=${phase.copyMaxMs.toFixed(2)}ms, bytes=${phase.copyBytes}`,
		`  snapshot: count=${phase.snapshotCount}, total=${phase.snapshotTotalMs.toFixed(2)}ms, max=${phase.snapshotMaxMs.toFixed(2)}ms`
	].join('\n')
}

console.log(formatPhase(phases.fixed))
console.log(formatPhase(phases.updating))
