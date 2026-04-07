import express from "express";
import {
  createProject,
  getProjectsByClub,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from "../controllers/projectControllers.js";

const router = express.Router();

router.get("/", getAllProjects);
router.get("/:project_id", getProjectById);
router.post("/club/:club_id", createProject);
router.put("/:project_id", updateProject);
router.delete("/:project_id", deleteProject);
router.get("/club/:club_id", getProjectsByClub);

export default router;