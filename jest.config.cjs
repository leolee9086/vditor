/** @type {import("jest").Config} */
module.exports = {
    coveragePathIgnorePatterns: ["/src/js/"],
    testTimeout: 30000,
    projects: [
        {
            displayName: "legacy",
            testPathIgnorePatterns: ["/node_modules/", "/(taskCommands|codeCommands).test.ts$"],
            transform: {
                "^.+\\.tsx?$": ["ts-jest", {tsconfig: "tsconfig.test.json"}],
            },
        },
        {
            // npm 路由包是原生 ESM；纯任务变换直接验证正式入口，不映射回本地源码。
            displayName: "source-esm",
            testMatch: ["<rootDir>/__test__/sv/taskCommands.test.ts", "<rootDir>/__test__/sv/codeCommands.test.ts"],
            extensionsToTreatAsEsm: [".ts"],
            transform: {
                "^.+\\.tsx?$": ["ts-jest", {
                    useESM: true,
                    tsconfig: {
                        module: "ESNext",
                        moduleResolution: "bundler",
                        target: "ES2018",
                        esModuleInterop: true,
                        skipLibCheck: true,
                        types: ["jest", "node"],
                    },
                }],
            },
        },
    ],
};
