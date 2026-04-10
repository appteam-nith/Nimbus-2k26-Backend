import { validate as emailValidator } from "deep-email-validator";

async function test() {
    console.log("Testing fake local-part on real domain (e.g. Gmail)...");
    const res2 = await emailValidator({
        email: "testfake29384824@gmail.com",
        validateSMTP: false
    });
    console.log("-> Real Gmail format pass? :", res2.valid, "\n");
    
    console.log("Testing fake invalid domain...");
    const resfake = await emailValidator({
        email: "testuser@fake-domain-12345.com",
        validateSMTP: false
    });
    console.log("-> Fake domain pass? :", resfake.valid);
    console.log("-> Reason:", resfake.validators.mx.reason);
}

test();
