import prisma from "../config/prisma.js";

// GET /api/users/leaderboard
// Query params:
//  - page (1-indexed, default 1)
//  - per_page (default 15, max 100)
//  - q (optional search string for full_name)
export const handleLeaderboard = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 15));
    const q = req.query.q ? String(req.query.q).trim() : null;

    const where = q
      ? { full_name: { contains: q, mode: "insensitive" } }
      : {};

    const total = await prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const skip = (page - 1) * perPage;

    const users = await prisma.user.findMany({
      where,
      select: {
        user_id: true,
        full_name: true,
        experience: true,
        experience_updated_at: true,
      },
      orderBy: [
        { experience: "desc" },
        { experience_updated_at: "asc" },
        { full_name: "asc" },
      ],
      skip,
      take: perPage,
    });

    const results = users.map((u, idx) => ({
      id: u.user_id,
      name: u.full_name,
      points: u.experience,
      experience_updated_at: u.experience_updated_at,
      rank: skip + idx + 1,
    }));

    return res.json({
      success: true,
      data: results,
      page,
      per_page: perPage,
      total,
      total_pages: totalPages,
    });
  } catch (err) {
    console.error("[leaderboard]", err.message);
    return res.status(500).json({ error: err.message });
  }
};
