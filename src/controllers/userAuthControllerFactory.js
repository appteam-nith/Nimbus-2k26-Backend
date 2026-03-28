const createEmailAuthControllers = ({
  createUser,
  findUserByEmail,
  hashPassword,
  comparePassword,
  tokenGenerator,
  generateAndStoreOtp,
  verifyOtp,
  sendOtpEmail,
  normalizeEmail,
  isValidEmailFormat,
  isAllowedCollegeEmail,
}) => {
  const sendOtp = async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) return res.status(400).json({ error: "email is required" });
      if (!isValidEmailFormat(email)) return res.status(400).json({ error: "Please provide a valid email address" });
      if (!isAllowedCollegeEmail(email)) return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

      const existingUser = await findUserByEmail(email);
      if (existingUser) return res.status(400).json({ error: "Email already in use" });

      const otp = generateAndStoreOtp(email);

      sendOtpEmail(email, otp).catch((err) => {
        console.error(`Failed to send OTP to ${email}:`, err.message);
      });

      return res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const registerUser = async (req, res) => {
    try {
      const { name, password, otp } = req.body;
      const email = normalizeEmail(req.body.email);

      if (!name || !email || !password || !otp) {
        return res.status(400).json({ error: "name, email, password, and otp are required" });
      }

      if (!isValidEmailFormat(email)) {
        return res.status(400).json({ error: "Please provide a valid email address" });
      }

      if (!isAllowedCollegeEmail(email)) {
        return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });
      }

      const existingUser = await findUserByEmail(email);
      if (existingUser) return res.status(400).json({ error: "Email already in use" });

      const isValidOtp = verifyOtp(email, otp);
      if (!isValidOtp) return res.status(400).json({ error: "Invalid or expired OTP" });

      const hashedPassword = await hashPassword(password);
      const user = await createUser(name, email, hashedPassword);

      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        user,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const loginUser = async (req, res) => {
    try {
      const { password } = req.body;
      const email = normalizeEmail(req.body.email);

      if (!email || !password) return res.status(400).json({ error: "email and password are required" });
      if (!isValidEmailFormat(email)) return res.status(400).json({ error: "Please provide a valid email address" });
      if (!isAllowedCollegeEmail(email)) return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

      const user = await findUserByEmail(email);

      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.password) return res.status(401).json({ error: "This account uses Google Sign-In. Please log in with Google." });

      const isPasswordValid = await comparePassword(password, user.password);
      if (!isPasswordValid) return res.status(401).json({ error: "Invalid Password" });

      const token = tokenGenerator(user.user_id);

      return res.json({ success: true, message: "Login successful", token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  return {
    sendOtp,
    registerUser,
    loginUser,
  };
};

export { createEmailAuthControllers };
