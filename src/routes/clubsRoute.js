import {Router} from "express";
import { createClub , addEvent } from "../controllers/clubControllers.js";

const router = Router();

router.post('/create', createClub )

router.post('/add-event', addEvent)


export default router;