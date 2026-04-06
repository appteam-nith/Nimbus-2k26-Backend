import prisma from "../../config/prisma.js";

const getAllCoreTeamMembers = async () => {
  const members = await prisma.coreTeamMember.findMany({
    orderBy: {
      created_at: 'desc'
    }
  });
  return members;
};

const createCoreTeamMember = async (name, role, imageUrl, linkedin) => {
  // Validate required inputs
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error("name is required");
  }

  if (!role || typeof role !== 'string' || role.trim().length === 0) {
    throw new Error("role is required");
  }

  const member = await prisma.coreTeamMember.create({
    data: {
      name,
      role,
      image_url: imageUrl,
      linkedin
    }
  });
  return member;
};

const deleteCoreTeamMember = async (id) => {
  // Validate and parse the ID
  const parsedId = Number.parseInt(id, 10);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Invalid member ID: must be a positive integer");
  }

  const member = await prisma.coreTeamMember.delete({
    where: {
      id: parsedId
    }
  });
  return member;
};

export {
  getAllCoreTeamMembers,
  createCoreTeamMember,
  deleteCoreTeamMember
};
