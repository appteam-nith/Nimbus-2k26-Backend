import {createUser, findUserByEmail } from "../services/user/userService.js";

import bcrypt from "bcrypt";

import sql from "../config/db.js";

import jwt from "jsonwebtoken";

const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: "Email already in use" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await createUser(name, email, hashedPassword);
        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid Password" });
        }
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

        res.json({ 
            success: true,
            message: "Login successful",
            token
         });

        
    } catch (error) {
        res.status(500).json({ error: error.message });
        
    }
}


export{
    registerUser,
    loginUser
}