// backend/routes/proctorRoutes.js
import express from "express";
import * as faceapi from "face-api.js";
import canvas from "canvas";
import path from "path";
import User from "../models/User.js";
import MalpracticeLog from "../models/MalpracticeLog.js";

const router = express.Router();

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Load models once on server start
const MODELS_DIR = path.join(process.cwd(), "face-models-tiny"); // you already ship these
let modelsLoaded = false;
async function ensureModels() {
  if (modelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_DIR);
  await faceapi.nets.faceLandmark68TinyNet.loadFromDisk(MODELS_DIR);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR);
  modelsLoaded = true;
}

// Small helper to decode dataURL -> Image
function dataURLtoBuffer(dataURL) {
  const base64 = dataURL.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

const THRESHOLD = 0.65; // same as your verification

/**
 * POST /api/proctor/check
 * body: { userId, challengeId, image: "data:image/jpeg;base64,..." }
 * returns: { status: "ok" | "no_face" | "multiple_faces" | "mismatch", distance?: number }
 */
router.post("/check", async (req, res) => {
  try {
    await ensureModels();

    const { userId, challengeId, image } = req.body;
    if (!userId || !challengeId || !image) {
      return res.status(400).json({ status: "error", message: "Missing fields" });
    }

    const user = await User.findById(userId);
    if (!user || !user.faceDescriptor || user.faceDescriptor.length === 0) {
      return res.status(400).json({ status: "error", message: "User has no enrolled face." });
    }

    const img = new Image();
    img.src = dataURLtoBuffer(image);

    const dets = await faceapi
      .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    // Cases
    if (!dets || dets.length === 0) {
      await MalpracticeLog.create({ userId, challengeId, type: "no_face" });
      return res.json({ status: "no_face" });
    }
    if (dets.length > 1) {
      await MalpracticeLog.create({ userId, challengeId, type: "multiple_faces" });
      return res.json({ status: "multiple_faces" });
    }

    const queryDescriptor = dets[0].descriptor; // Float32Array
    const referenceDescriptor = new Float32Array(user.faceDescriptor);
    const distance = faceapi.euclideanDistance(queryDescriptor, referenceDescriptor);
    const verified = distance < THRESHOLD;

    if (!verified) {
      await MalpracticeLog.create({ userId, challengeId, type: "mismatch", meta: { distance } });
      return res.json({ status: "mismatch", distance });
    }

    // All good
    return res.json({ status: "ok", distance });
  } catch (err) {
    console.error("Proctor check error:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

export default router;
