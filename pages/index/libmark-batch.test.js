jest.setTimeout(130000)

describe('Harmony libmark batch delivery', () => {
	let page

	async function waitForCompletion() {
		for (let i = 0; i < 200; i++) {
			const status = await page.$('.chat-extension-input-status-text')
			if (status == null) return true
			await page.waitFor(500)
		}
		return false
	}

	beforeAll(async () => {
		page = await program.reLaunch('/uni_modules/uni-ai-x/pages/index/index')
		await page.waitFor('.chat-extension-input-action')
	})

	it('completes the full Markdown stream after all operations are consumed', async () => {
		const fullMarkdownAction = await page.$('.chat-extension-input-action')
		await fullMarkdownAction.tap()
		await page.waitFor('.chat-extension-input-status-text')

		expect(await waitForCompletion()).toBe(true)
	})

	it('completes a new stream immediately after cancelling the previous request', async () => {
		const actions = await page.$$('.chat-extension-input-action')
		await actions[0].tap()
		await page.waitFor('.chat-extension-input-status-text')
		const stop = await page.$('.chat-extension-input-stop')
		await stop.tap()
		await page.waitFor(300)
		await actions[0].tap()
		await page.waitFor('.chat-extension-input-status-text')

		expect(await waitForCompletion()).toBe(true)
	})
})
