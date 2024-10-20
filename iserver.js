const express = require('express');
const mysql = require('mysql2/promise'); // Use promise-based mysql2
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const helmet = require('helmet'); // Security middleware
const rateLimit = require('express-rate-limit'); // Rate limiting
const morgan = require('morgan'); // Logging
const cookieParser = require('cookie-parser'); // Cookie parser
const dotenv = require('dotenv'); // Environment variables
const bcrypt = require('bcrypt'); // Password hashing

dotenv.config(); // Load environment variables

const app = express();
const port = process.env.PORT || 3000; // Use environment port or default

// Create a MySQL connection
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware
app.use(helmet()); // Protect against well-known vulnerabilities
app.use(morgan('combined')); // Logging
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET, // Use an environment variable for secrets
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 60 * 1000, // Session lasts for 30 minutes
        secure: true, // Use secure cookies (set to true in HTTPS)
        httpOnly: true // Prevent client-side access to cookies
    }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting to prevent brute-force attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Respond with 'index.html' when a GET request is made to the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle POST request for login
app.post('/login', async (req, res) => {
    let { name, password } = req.body;
    name = name.trim();

    try {
        const [results] = await connection.query("SELECT username, password FROM authentication WHERE username = ?", [name]);
        
        if (results.length > 0) {
            const user = results[0];
            const isPasswordValid = await bcrypt.compare(password, user.password); // Use bcrypt for password checking

            if (isPasswordValid) {
                req.session.loggedIn = true;
                req.session.username = name;
                return res.redirect('/mentor'); // Redirect to protected route
            }
        }
        req.session.loggedIn = false;
        return res.redirect('/?error=invalid'); // Handle invalid login
    } catch (error) {
        console.error('Database query error:', error);
        return res.redirect('/?error=invalid');
    }
});

// Middleware to check if the user is logged in
function requireLogin(req, res, next) {
    if (req.session.loggedIn) {
        next(); // User is authenticated, proceed
    } else {
        res.redirect('/'); // Redirect to login page if not authenticated
    }
}

// Handle GET request for the protected /mentor route
app.get('/mentor', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'protected', 'mentor.html'));
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Error logging out');
        }
        res.redirect('/'); // Redirect to homepage after logout
    });
});

// Serve leaderboard.html
app.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});

// Fetch leaderboard data based on category
app.get('/api/leaderboard', async (req, res) => {
    const category = req.query.category || 'All';
    let query = `
        SELECT m.member_id, m.member_name AS name, 
               IFNULL(SUM(mp.task_points), 0) AS points
        FROM members m
        LEFT JOIN member_points mp ON m.member_id = mp.member_id
        LEFT JOIN tasks t ON mp.task_id = t.task_id
    `;

    if (category !== 'All') {
        query += ` WHERE t.task_domain = ?`;
    }

    query += ` GROUP BY m.member_id, m.member_name ORDER BY points DESC;`;

    try {
        const results = await connection.query(query, [category !== 'All' ? category : null]);
        res.json(results[0]); // Return results
    } catch (error) {
        console.error('Database query error:', error);
        return res.status(500).send('Error fetching leaderboard data');
    }
});

// Endpoint to fetch member name suggestions based on input query
app.get('/api/search-members', async (req, res) => {
    const query = req.query.query;
    try {
        const [results] = await connection.query('SELECT member_name FROM members WHERE member_name LIKE ? LIMIT 5', [`%${query}%`]);
        res.json({ members: results });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Endpoint to get full member details by name
app.get('/api/get-member-details', async (req, res) => {
    const memberName = req.query.name;
    try {
        const [results] = await connection.query('SELECT * FROM members WHERE member_name = ?', [memberName]);
        if (results.length > 0) {
            return res.json({ member: results[0] });
        } else {
            return res.status(404).json({ message: 'Member not found' });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/add-member', async (req, res) => {
    const { member_id, member_name, year_of_study, gender, mobile_numbers } = req.body;

    if (!member_id || !member_name || !year_of_study || !gender || !mobile_numbers) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const lowerCaseMemberId = member_id.trim().toLowerCase();

    try {
        const [results] = await connection.query('SELECT member_id FROM members WHERE member_id = ?', [lowerCaseMemberId]);

        if (results.length > 0) {
            return res.json({ exists: true }); // Member already exists
        }

        const query = 'INSERT INTO members (member_id, member_name, year_of_study, gender, mobile_numbers) VALUES (?, ?, ?, ?, ?)';
        await connection.query(query, [lowerCaseMemberId, member_name, year_of_study, gender, mobile_numbers]);
        res.json({ exists: false });
    } catch (error) {
        console.error('Database query error:', error);
        return res.status(500).json({ error: 'Error adding member' });
    }
});

// Endpoint to add a task
app.post('/api/add-task', async (req, res) => {
    const { task_id, task_name, task_domain, task_description } = req.body;

    if (!task_id || !task_name || !task_domain || !task_description) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const lowerCaseTaskId = task_id.trim().toLowerCase();

    try {
        const [results] = await connection.query('SELECT task_id FROM tasks WHERE task_id = ?', [lowerCaseTaskId]);

        if (results.length > 0) {
            return res.json({ exists: true }); // Task already exists
        }

        const query = 'INSERT INTO tasks (task_id, task_name, task_domain, task_description) VALUES (?, ?, ?, ?)';
        await connection.query(query, [lowerCaseTaskId, task_name, task_domain, task_description]);
        res.json({ exists: false });
    } catch (error) {
        console.error('Database query error:', error);
        return res.status(500).json({ error: 'Error adding task' });
    }
});

// Endpoint to fetch tasks by domain
app.get('/api/tasks-by-domain', async (req, res) => {
    const domain = req.query.domain;
    const sql = `
        SELECT task_id, task_name 
        FROM tasks 
        WHERE task_domain = ?
    `;
    try {
        const [results] = await connection.query(sql, [domain]);
        res.json({ tasks: results });
    } catch (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Update points for members
app.post('/api/update-points', async (req, res) => {
    const { member_id, task_id, points } = req.body;

    if (!member_id || !task_id || !points) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const [results] = await connection.query(`
            SELECT m.member_id, t.task_id 
            FROM members m 
            JOIN tasks t 
            WHERE m.member_id = ? AND t.task_id = ?
        `, [member_id, task_id]);

        if (results.length > 0) {
            const sql = 'INSERT INTO member_points (member_id, task_id, task_points) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE task_points = task_points + ?';
            await connection.query(sql, [member_id, task_id, points, points]);
            return res.status(200).json({ message: 'Points updated successfully' });
        } else {
            return res.status(404).json({ message: 'Member or task not found' });
        }
    } catch (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
