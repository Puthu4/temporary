import express from "express";
import User from "../models/User.js";
import * as faceapi from "face-api.js";
import canvas from "canvas";
import path from "path";
import fs from "fs";
import multer from "multer";

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const router = express.Router();

// Multer setup
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG and PNG images are allowed."));
  },
});

// Load face-api models on server start
await faceapi.nets.tinyFaceDetector.loadFromDisk("./face-models-tiny");
await faceapi.nets.faceRecognitionNet.loadFromDisk("./face-models-tiny");
await faceapi.nets.faceLandmark68TinyNet.loadFromDisk("./face-models-tiny");

/**
 * POST /api/register
 */
router.post("/register", async (req, res) => {
  const { seatNumber, fullName, email, password, role } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "Email already registered" });

    const newUser = new User({ seatNumber, fullName, email, password, role });
    await newUser.save();
    res.status(201).json({ message: "User created", user: newUser });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/login
 */
router.post("/login", async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const user = await User.findOne({ email, role });
    if (!user) return res.status(401).json({ message: "Invalid email or role" });
    if (user.password !== password) return res.status(401).json({ message: "Incorrect password" });

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        seatNumber: user.seatNumber,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/profile/:email
 */
router.get("/profile/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/profile/:email
 */
router.put("/profile/:email", upload.single("image"), async (req, res) => {
  try {
    const { fullName, seatNumber, oldPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (fullName) user.fullName = fullName;
    if (seatNumber) user.seatNumber = seatNumber;

    if (newPassword || confirmPassword) {
      if (!oldPassword) return res.status(400).json({ message: "Old password is required to change password" });
      if (oldPassword !== user.password) return res.status(400).json({ message: "Old password is incorrect" });
      if (newPassword !== confirmPassword) return res.status(400).json({ message: "Passwords do not match" });
      user.password = newPassword;
    }

    if (req.file) {
      const imagePath = req.file.path;
      user.image = `/uploads/${req.file.filename}`;
      const img = await canvas.loadImage(imagePath);

      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        return res.status(400).json({ verified: false, message: "No face detected in uploaded image." });
      }

      user.faceDescriptor = Array.from(detection.descriptor);
    }

    await user.save({ validateModifiedOnly: true });
    res.json({ user, message: "Profile updated successfully!" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error during profile update" });
  }
});

/**
 * POST /api/verify-identity/:challengeId
 */
router.post("/verify-identity/:challengeId", async (req, res) => {
  try {
    const { email, image } = req.body;
    if (!email || !image)
      return res.status(400).json({ verified: false, message: "Missing email or image" });

    const user = await User.findOne({ email });
    console.log("🟢 User loaded:", user?.email);
    console.log("🟢 Face descriptor length:", user?.faceDescriptor?.length);

    if (!user?.faceDescriptor || !Array.isArray(user.faceDescriptor) || user.faceDescriptor.length !== 128)
      return res.status(404).json({ verified: false, message: "Invalid or missing face descriptor in profile" });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const img = await canvas.loadImage(buffer);

    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      return res.status(400).json({ verified: false, message: "No face detected." });
    }

    const queryDescriptor = detection.descriptor;
    const referenceDescriptor = new Float32Array(user.faceDescriptor);
    const distance = faceapi.euclideanDistance(queryDescriptor, referenceDescriptor);
    console.log("🟢 Distance between faces:", distance);

    const verified = distance < 0.5;

    return res.json({
      verified,
      distance,
      message: verified ? "Face verified" : "Face mismatch. Try again.",
    });
  } catch (err) {
    console.error("🔴 Identity verification crash:", err.stack || err);
    return res.status(500).json({ verified: false, message: err.message || "Unknown error" });
  }
});
export default router;