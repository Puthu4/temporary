import express from "express";
import User from "../models/User.js";   // ✅ default import (your User.js uses export default)

const router = express.Router();

/* ---------------------------------------------------------
   BLOCK USER (Triggered from malpractice in Challenge page)
----------------------------------------------------------*/
router.post("/block-user", async (req, res) => {
  try {
    const { email, reason } = req.body;

    const user = await User.findOneAndUpdate(
      { email },
      {
        isBlocked: true,
        blockedReason: reason || "Malpractice detected",
        blockedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User blocked successfully", user });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Error blocking user" });
  }
});

/* ---------------------------------------------------------
   UNBLOCK USER (Admin Panel)
----------------------------------------------------------*/
router.post("/unblock-user", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOneAndUpdate(
      { email },
      {
        isBlocked: false,
        blockedReason: "",
        blockedAt: null,
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User unblocked successfully", user });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Error unblocking user" });
  }
});

/* ---------------------------------------------------------
   CHECK BLOCK STATUS (Student Side)
----------------------------------------------------------*/
router.get("/check-blocked/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ isBlocked: false });
    }

    res.json({ isBlocked: user.isBlocked });
  } catch (error) {
    console.error("Error checking block status:", error);
    res.status(500).json({ isBlocked: false });
  }
});

/* ---------------------------------------------------------
   GET ALL BLOCKED USERS (Admin Panel)
----------------------------------------------------------*/
router.get("/blocked-users", async (req, res) => {
  try {
    const blockedList = await User.find({ isBlocked: true });
    res.json(blockedList);
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    res.status(500).json({ message: "Error fetching blocked users" });
  }
});

export default router;
