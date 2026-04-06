import { Router } from "express";
import { getCoreTeam, addCoreTeamMember, removeCoreTeamMember } from "../controllers/coreTeamController.js";

const router = Router();

router.get('/', getCoreTeam);

router.post('/', addCoreTeamMember);

router.delete('/:id', removeCoreTeamMember);

export default router;
