import sql from "../../config/db.js";

const createUser = async (name, email, password) => {
  const result = await sql`
    INSERT INTO users (name, email, password)
    VALUES (${name}, ${email}, ${password})
    RETURNING id, name, email
  `;
  return result[0];
};

const findUserByEmail = async (email) => {
  const result = await sql`
    SELECT id, name, email, password
    FROM users
    WHERE email = ${email}
  `;
  return result[0]; // undefined if not found
};



const createGoogleUser = async (name, email, googleId) => {
  const res = await sql`
    INSERT INTO users (name, email, google_id)
    VALUES (${name}, ${email}, ${googleId})
    RETURNING *
  `;
  return res[0];
};




export{
  createUser,
  findUserByEmail,
  createGoogleUser
};