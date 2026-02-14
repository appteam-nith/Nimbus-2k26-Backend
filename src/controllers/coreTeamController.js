import { getAllCoreTeamMembers, createCoreTeamMember, deleteCoreTeamMember } from "../services/coreteam/coreTeamService.js";

const getCoreTeam = async (req, res) => {
    try {
        const members = await getAllCoreTeamMembers();
        res.status(200).json({
            success: true,
            message: "Core team members retrieved successfully",
            data: members
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const addCoreTeamMember = async (req, res) => {
    try {
        const { name, role, image_url, linkedin } = req.body;

        const member = await createCoreTeamMember(name, role, image_url || null, linkedin || null);
        res.status(201).json({
            success: true,
            message: "Core team member added successfully",
            data: member
        });
    } catch (error) {
        if (error.message.includes("is required")) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
};

const removeCoreTeamMember = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: "Member ID is required" });
        }

        const member = await deleteCoreTeamMember(id);
        res.status(200).json({
            success: true,
            message: "Core team member deleted successfully",
            data: member
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Core team member not found" });
        }
        if (error.message.includes("Invalid member ID")) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
};

export {
    getCoreTeam,
    addCoreTeamMember,
    removeCoreTeamMember
};
