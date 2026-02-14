import { Router } from "express";
import {registerUser,loginUser} from "../controllers/usercontroller.js";

const router = Router();


router.post('/register', registerUser);

router.post('/login', loginUser);

// Event Timeline Routes (Under construction)
router.get('/events', getEventByDate);
router.get('/events/:id', getEventById);

export default router;