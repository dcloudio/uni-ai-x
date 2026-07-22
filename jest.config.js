/**
 * 注意：
 * - testMatch: 每次运行测试都会自动修改testMatch，如果想禁用自动修改，请到HBuilderX菜单【设置】【插件配置】【自动修改jest.config.js文件中的testMatch】，去掉勾选。
 */

module.exports = {
    testTimeout: 10000,
    reporters: [
        'default'
    ],
    watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/.git/'],
    moduleFileExtensions: ['js', 'json'],
    rootDir: __dirname,
    testMatch: ["<rootDir>/pages/**/*test.[jt]s?(x)"],
    testPathIgnorePatterns: ['/node_modules/'],
	setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
}
