const js = require("@eslint/js")

module.exports = [
   { ignores: ["node_modules/**"] },
   js.configs.recommended,
   {
      files: ["**/*.js"],
      languageOptions: {
         ecmaVersion: 2023,
         sourceType: "commonjs",
         globals: {
            process: "readonly",
            console: "readonly",
            module: "writable",
            require: "readonly",
            __dirname: "readonly",
            setImmediate: "readonly",
            Buffer: "readonly",
         },
      },
      rules: {
         "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
         eqeqeq: ["error", "smart"],
         "no-console": "off",
      },
   },
]
