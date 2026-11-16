// 專抓「建置會過、但一執行就壞」的錯：沒定義的變數、打錯的函式或元件名稱、Hook 用錯位置
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: { react, "react-hooks": hooks },
    rules: {
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "no-dupe-keys": "error",
      "no-const-assign": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
    },
  },
];
