import eslint from "@eslint/js";

export default [
  eslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "quotes": ["error", "single"],
      "indent": ["error", 2],
      "max-len": ["warn", { code: 120 }],
      "linebreak-style": "off",
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "ignoreRestSiblings": true,
      }],
      // New in @eslint/js 10 recommended — disable for now, fix incrementally
      "no-useless-assignment": "warn",
      "preserve-caught-error": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "__tests__/**",
      "jest.config.js",
      // Machine-written by scripts/build-instructions.mjs: the skill text is
      // emitted as one JSON string literal per block, so max-len is neither
      // meetable nor meaningful there.
      "lib/instructions.generated.js",
      "prompts/commands.generated.js",
      "eslint.config.mjs",
    ],
  },
];
