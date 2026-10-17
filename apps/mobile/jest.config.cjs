module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.component.tsx"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
};
