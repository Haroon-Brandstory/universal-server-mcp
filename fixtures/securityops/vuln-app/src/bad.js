// Intentionally vulnerable fixture for SecurityOps tests — DO NOT COPY TO PROD.
const api_key = "sk_test_hardcoded_secret_value_12345";
export function run(userInput) {
  return eval(userInput);
}
