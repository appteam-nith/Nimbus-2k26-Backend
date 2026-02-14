import { Router } from "express";
import { registerUser, loginUser } from "../controllers/usercontroller.js";
import { getEventsByDate } from "../controllers/eventControllers.js";
import validateDate from "../middlewares/valDateMiddleware.js";

const router = Router();


router.post('/register', registerUser);

router.post('/login', loginUser);

// Event Timeline Routes (Under construction)
router.get('/events', validateDate, getEventsByDate);

export default router;