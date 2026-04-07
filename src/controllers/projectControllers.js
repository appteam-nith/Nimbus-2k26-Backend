import prisma from "../config/prisma.js";

// Create Project for a Club
export const createProject = async (req, res) => {
  try {
    const { club_id } = req.params;
    const { project_name, description, image_url } = req.body;

    if (!project_name) {
      return res.status(400).json({ error: "project_name is required" });
    }

    const club = await prisma.club.findUnique({
      where: { club_id: parseInt(club_id) },
    });
    if (!club) return res.status(404).json({ error: "Club not found" });

    const project = await prisma.project.create({
      data: {
        project_name,
        description: description || null,
        image_url: image_url || null,
        club_id: parseInt(club_id),
      },
    });

    res.status(201).json({ message: "Project created successfully", project });
  } catch (error) {
    console.error("Error creating project:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all Projects of a Club
export const getProjectsByClub = async (req, res) => {
  try {
    const { club_id } = req.params;

    const projects = await prisma.project.findMany({
      where: { club_id: parseInt(club_id) },
      orderBy: { created_at: "desc" },
    });

    res.status(200).json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all Projects (sab clubs ke)
export const getAllProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { created_at: "desc" },
      include: {
        club: {
          select: { club_name: true, club_type: true },
        },
      },
    });

    res.status(200).json({ projects });
  } catch (error) {
    console.error("Error fetching all projects:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get single Project by ID
export const getProjectById = async (req, res) => {
  try {
    const { project_id } = req.params;

    const project = await prisma.project.findUnique({
      where: { project_id: parseInt(project_id) },
      include: {
        club: {
          select: { club_name: true, club_type: true, department: true },
        },
      },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });

    res.status(200).json({ project });
  } catch (error) {
    console.error("Error fetching project:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Update Project
export const updateProject = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { project_name, description, image_url } = req.body;

    const existing = await prisma.project.findUnique({
      where: { project_id: parseInt(project_id) },
    });
    if (!existing) return res.status(404).json({ error: "Project not found" });

    const updated = await prisma.project.update({
      where: { project_id: parseInt(project_id) },
      data: {
        ...(project_name && { project_name }),
        ...(description !== undefined && { description }),
        ...(image_url !== undefined && { image_url }),
      },
    });

    res.status(200).json({ message: "Project updated successfully", project: updated });
  } catch (error) {
    console.error("Error updating project:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Delete Project
export const deleteProject = async (req, res) => {
  try {
    const { project_id } = req.params;

    const existing = await prisma.project.findUnique({
      where: { project_id: parseInt(project_id) },
    });
    if (!existing) return res.status(404).json({ error: "Project not found" });

    await prisma.project.delete({
      where: { project_id: parseInt(project_id) },
    });

    res.status(200).json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error.message);
    res.status(500).json({ error: error.message });
  }
};