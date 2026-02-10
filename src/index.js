import dotenv from "dotenv";
dotenv.config();


import express from 'express';
import UserRoutes from "./routes/userRoute.js";


const app = express();
const PORT = process.env.PORT || 3000;




// Middleware to parse JSON bodies  
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, Nimbus 2k26 Backend!');
});

app.use('/api/users', UserRoutes);



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 