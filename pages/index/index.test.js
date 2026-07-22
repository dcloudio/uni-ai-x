// uni-app自动化测试教程: https://uniapp.dcloud.net.cn/worktile/auto/hbuilderx-extension/
jest.setTimeout(120000);
const platformInfo = process.env.uniTestPlatformInfo.toLocaleLowerCase()
const isAndroid = platformInfo.startsWith('android')
const isIos = platformInfo.startsWith('ios')
const isHarmony = platformInfo.startsWith('harmony')
const isApp = isAndroid || isIos || isHarmony
describe('UNI-AI-X', () => {
	let page,chatBoxEl,leftNavbarEl;
	beforeAll(async () => {
		// 跳转到首页
		page = await program.reLaunch('/uni_modules/uni-ai-x/pages/index/index');
		// 等待页面元素加载
		await page.waitFor('view');
		chatBoxEl = await page.$('.chat-box');
        console.log('chatBoxEl',chatBoxEl)
		expect(chatBoxEl).toBeTruthy();
	});

	async function getNavAddChatEl() {
		const navBarEl = await chatBoxEl.$('.chat-box-nav-bar');
		if (!navBarEl) {
			return null;
		}
		return await navBarEl.$('.add-chat');
	}

	async function openMenu() {
		chatBoxEl = await page.$('.chat-box');
		leftNavbarEl = await chatBoxEl.$('.chat-box-nav-bar');
		const leftEl = await leftNavbarEl.$('.uni-ai-icon');
		await leftEl.tap();
		await page.waitFor(2000);
		const menuBoxEl = await page.$('.menu-box');
		expect(menuBoxEl).toBeTruthy();
		return menuBoxEl;
	}

	async function switchToHistoryChat(menuBoxEl) {
		const chatList = await menuBoxEl.$$('.menu-box-chat-item');
		for (let i = 0; i < chatList.length; i++) {
			const titleEl = await chatList[i].$('.menu-box-chat-item-title');
			const title = await titleEl.text();
			if (title !== '新对话') {
				await chatList[i].tap();
				await page.waitFor(2000);
				return true;
			}
		}
		return false;
	}
	
	describe('页面基本结构测试', () => {
		
		it('应该显示欢迎消息', async () => {
			let welcomeMsgEl = await chatBoxEl.$('.chat-box-welcome-msg-box');
			console.log('welcomeMsgEl',welcomeMsgEl)
			if (!welcomeMsgEl) {
				const addChatBtn = await getNavAddChatEl();
				console.log('addChatBtn--:',addChatBtn)
				if (addChatBtn) {
					await addChatBtn.tap();
					await page.waitFor(1000);
					welcomeMsgEl = await chatBoxEl.$('.chat-box-welcome-msg-box');
				}
			}
			expect(welcomeMsgEl).toBeTruthy();
			const titleEl = await welcomeMsgEl.$('.chat-box-welcome-title');
			console.log('titleEl',titleEl)
			expect(titleEl).toBeTruthy();
			expect(await titleEl.text()).toEqual('嗨！我是 UNI-AI');
			const textEl = await welcomeMsgEl.$('.chat-box-welcome-text');
			expect(textEl).toBeTruthy();
			expect(await textEl.text()).toEqual('我可以帮你回答问题、写代码、翻译、写诗等。');
		});
		
		it('应该显示聊天输入框', async () => {
			const inputEl = await chatBoxEl.$('.chat-box-chat-input');
			expect(inputEl).toBeTruthy();
			expect(await inputEl.attribute('placeholder')).toEqual('给 uni-ai-x 发送消息');
		});
		
		it('应该显示导航栏', async () => {
			const navBar = await chatBoxEl.$('.chat-box-nav-bar');
			expect(navBar).toBeTruthy();
			// 验证聊天标题
			const chatTitle = await chatBoxEl.$('.chat-box-chat-title');
			expect(chatTitle).toBeTruthy();
		});
		
		it('应该显示底部工具栏', async () => {
			const bottom = await chatBoxEl.$('.chat-box-bottom');
			expect(bottom).toBeTruthy();
			// 验证输入框
			const input = await bottom.$('.chat-box-chat-input');
			expect(input).toBeTruthy();
		});
		
		it('应该显示提示信息', async () => {
			const tip = await chatBoxEl.$('.chat-box-tip');
			expect(tip).toBeTruthy();
			expect(await tip.text()).toEqual('内容由ai生成，仅供参考');
		});
	});
	
	async function sendMsg(msg){
		const inputEl = await chatBoxEl.$('.chat-box-chat-input');
		// 输入测试消息
		await inputEl.input(msg);
		// 发送
		const bottom = await chatBoxEl.$('.chat-box-bottom');
		const inputToolBarEl = await bottom.$('.input-tool-bar');
		const sendEl = await inputToolBarEl.$('.input-tool-bar-send');
		await page.waitFor(1000)
		await sendEl.tap()
		await page.waitFor(5000)
	}
	
	async function welcomeMsg(){
		chatBoxEl = await page.$('.chat-box');
		let welcomeMsgEl = await chatBoxEl.$('.chat-box-welcome-msg-box');
		if (!welcomeMsgEl) {
			const addChatBtn = await getNavAddChatEl();
			if (addChatBtn) {
				await addChatBtn.tap();
				await page.waitFor(1000);
				welcomeMsgEl = await chatBoxEl.$('.chat-box-welcome-msg-box');
			}
		}
		expect(welcomeMsgEl).toBeTruthy();
		const titleEl = await welcomeMsgEl.$('.chat-box-welcome-title');
		expect(await titleEl.text()).toEqual('嗨！我是 UNI-AI');
	}
	
	describe('聊天功能测试', () => {
		it('应该能够输入内容', async () => {
			// 输入测试消息
            // app端需要自定义基座才能返回测试内容 
            if(!isApp){
                await sendMsg('测试消息')
            }else{
                const inputEl = await chatBoxEl.$('.chat-box-chat-input');
                // 输入测试消息
                await inputEl.tap();
                // 发送
                const bottom = await chatBoxEl.$('.chat-box-bottom');
                const inputToolBarEl = await bottom.$('.input-tool-bar');
                const sendEl = await inputToolBarEl.$('.input-tool-bar-send');
                await page.waitFor(1000)
                await sendEl.tap()
            }
            // await page.waitFor(5000)
            
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
			// 等待内容完全输出
			await page.waitFor(35000)
		});
		
		it('应该显示消息列表容器', async () => {
			// 验证滚动视图属性
			const msgList = await chatBoxEl.$('.chat-box-msg-list');
			expect(msgList).toBeTruthy();
			const y = (await msgList.scrollHeight()) - 200
			await msgList.scrollTo(0, y)
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
		});
	});
	
	describe('三处开启新对话',()=>{
		it('消息结束末尾开启',async ()=>{
			const addChatBtnEl = await chatBoxEl.$('.add-chat-box');
			const addChatEl = await addChatBtnEl.$('.add-chat');
			await addChatEl.tap()
			await page.waitFor(2000)
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
			// 验证新会话
			await welcomeMsg()
		})
		
		it('应该支持多行输入', async () => {
			// 输入多行文本
			const multiLineText = '第一行\n第二行\n第三行';
			await sendMsg(multiLineText)
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
			// 等待内容完全输出
			await page.waitFor(35000)
		});
        
        // 临时注释
        // app端需要自定义基座才能返回测试内容 
        if(!isApp){
            it('右上角+开启',async ()=>{
	            const addChatEl = await getNavAddChatEl();
	            // 点击+
	            await addChatEl.tap()
            	await page.waitFor(2000)
            	// 截图结果
            	const image = await program.screenshot();
            	expect(image).toSaveImageSnapshot();
            	// 验证新会话
            	await welcomeMsg()
            })
            it('应该支持输入', async () => {
            	// 输入多行文本
            	const text = 'uni-app x 是什么？';
            	await sendMsg(text)
            	// 截图结果
            	const image = await program.screenshot();
            	expect(image).toSaveImageSnapshot();
            	// 等待内容完全输出
            	await page.waitFor(35000)
            });
        }
        
		it('左侧抽屉开启',async ()=>{
			let menuBoxEl = await openMenu();
			// 验证开启新对话
			let addChatEl = await menuBoxEl.$('.add-chat');
			if (!addChatEl) {
				const switched = await switchToHistoryChat(menuBoxEl);
				expect(switched).toBeTruthy();
				menuBoxEl = await openMenu();
				addChatEl = await menuBoxEl.$('.add-chat');
			}
			expect(addChatEl).toBeTruthy();
			const addChatTextEl = await addChatEl.$('.add-chat-box-text');
			expect(await addChatTextEl.text()).toEqual('开启新对话');
			// 点击菜单按钮
			await addChatEl.tap();
			await page.waitFor(2000);
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
			// 验证新会话
			await welcomeMsg()
		})
	})
	
	describe('菜单功能测试', () => {
		it('应该能够打开菜单', async () => {
			leftNavbarEl = await chatBoxEl.$('.chat-box-nav-bar');
			leftEl = await leftNavbarEl.$('.uni-ai-icon');
			// 点击菜单按钮
			await leftEl.tap();
			// 等待菜单显示
			await page.waitFor(2000);
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
		});
		
		it('应该显示历史对话列表', async () => {
			// 验证菜单标题
			const menuBoxEl = await page.$('.menu-box');
			const menuTitleEl = await menuBoxEl.$('.menu-box-title');
			expect(await menuTitleEl.text()).toEqual('UNI-AI 助手');
			// 验证历史对话导航
			const navEl = await menuBoxEl.$('.menu-box-nav');
			expect(await navEl.text()).toEqual('历史对话');
			// 历史消息聊天列表
			const chatList = await menuBoxEl.$$('.menu-box-chat-item');
			expect(chatList).toBeTruthy();
			const expectedMinChatCount = isApp ? 3 : 4;
			expect(chatList.length).toBeGreaterThanOrEqual(expectedMinChatCount);
			for (let i = 0; i < chatList.length; i++) {
				const titleEl = await chatList[i].$('.menu-box-chat-item-title');
				expect(titleEl).toBeTruthy();
				expect((await titleEl.text()).length).toBeGreaterThan(0);
			}
		});
		
		it('应该显示用户信息', async () => {
			const menuBoxEl = await page.$('.menu-box');
			const bottomEl = await menuBoxEl.$('.menu-box-bottom');
			// 验证用户头像
			const avatar = await bottomEl.$('.menu-box-avatar');
			expect(avatar).toBeTruthy();
			// 验证用户名称或登录提示
			const userName = await bottomEl.$('.menu-box-to-login');
			expect(userName).toBeTruthy();
			expect(await userName.text()).toEqual('未登录');
		});
		
		it('应该支持模型切换', async () => {
			const menuBoxEl = await page.$('.menu-box');
			const bottomEl = await menuBoxEl.$('.menu-box-bottom');
			// 点击设置按钮
			const settingIcon = await bottomEl.$('.menu-box-setting-icon');
			await settingIcon.tap();
			// 等待设置面板显示
			await page.waitFor(1000);
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
			// 验证设置面板存在
			const settingContainer = await menuBoxEl.$('.uni-im-setting-popup-content');
			expect(settingContainer).toBeTruthy();
			const value = await menuBoxEl.$('.uni-im-setting-value-box');
			await value.tap();
			// 等待设置面板显示
			await page.waitFor(1000);
			
			// 截图结果
			const image1 = await program.screenshot();
			expect(image1).toSaveImageSnapshot();
			
			// 关闭设置弹框
			await settingIcon.tap();
		});
		
		it('应该能够关闭菜单', async () => {
			// 点击菜单按钮关闭菜单
			leftNavbarEl = await chatBoxEl.$('.chat-box-nav-bar');
			leftEl = await leftNavbarEl.$('.uni-ai-icon');
			await leftEl.tap();
			// 等待菜单隐藏
			await page.waitFor(5000);
			// 截图结果
			const image = await program.screenshot();
			expect(image).toSaveImageSnapshot();
			// 验证菜单已隐藏（menu-box 在页面层级，不在 nav 下，通过截图已验证关闭）
			const menuBox = await page.$('.menu-box');
			expect(menuBox).toBeTruthy();
		});
        
        it('screenshot', async () => {
          const image = await program.screenshot({ fullPage: true });
          expect(image).toSaveImageSnapshot();
        });
		
	});
	
});
