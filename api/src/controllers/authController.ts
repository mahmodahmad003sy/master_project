// src/controllers/authController.ts
import { Request, Response } from "express";
import { User } from "../entities/User";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import config from "../../config/default.json";

const JWT_SECRET = config.auth.jwtSecret;

export const register = async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = User.create({ email, name, password: hash });
  await user.save();
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "8h" });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "8h" });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
};
