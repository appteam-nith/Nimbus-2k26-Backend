import { login } from "./src/controllers/emailAuthController.js";
import { REVIEWER_EMAIL, REVIEWER_PASSWORD } from "./src/utils/authEmail.js";

async function testLogin() {
    const req = {
        body: {
            email: REVIEWER_EMAIL,
            password: REVIEWER_PASSWORD
        }
    };
    const res = {
        status: function(code) {
            this.statusCode = code;
            return this;
        },
        json: function(data) {
            console.log(`Status: ${this.statusCode}`);
            console.log(`Response:`, JSON.stringify(data, null, 2));
            
            if (this.statusCode === 200 && data.success) {
                console.log("✅ LOGIN SUCCESSFUL. Reviewer credentials worked!");
                console.log("Token:", data.token);
                console.log("Frontend behavior check: This response gives 'success: true' and a 'token'. The frontend 'LoginScreen' should store this token and redirect to '/home'.");
            } else {
                console.error("❌ LOGIN FAILED.", data.error);
            }
            return this;
        }
    };

    console.log(`Attempting login with Reviewer credentials: ${REVIEWER_EMAIL}`);
    await login(req, res);
}

testLogin().then(() => {
    console.log("Test finished.");
    process.exit(0);
}).catch(err => {
    console.error("Error during test:", err);
    process.exit(1);
});
