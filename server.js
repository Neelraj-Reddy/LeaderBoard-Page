const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');


const app = express();
const port = 3000; // Port number

// Create a MySQL connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'test',
    password: '1234',
    database: 'cognizance'
});

// Connect to MySQL
connection.connect(error => {
    if (error) {
        console.error('Database connection error:', error);
        throw error;
    }
    console.log('Connected to Database successfully!');
});

// Use body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());


// Use express-session middleware for session management
app.use(session({
    secret: 'your-secret-key', // replace this with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 1000 } // Session will last for 30 minutes
}));

// Serve static files from the 'public' directory (only public files will be served)
app.use(express.static(path.join(__dirname, 'public')));

// Respond with 'index.html' when a GET request is made to the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle POST request for login
app.post('/login', (req, res) => {
    var { name, password } = req.body;
    name = name.trim();

    const query = "SELECT username, password FROM authentication WHERE username = ?";
    connection.query(query, [name], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.redirect('/?error=invalid');
        }

        if (results.length > 0) {
            const user = results[0];
            if (password === user.password) {
                // Set session variables to indicate successful login
                req.session.loggedIn = true;
                req.session.username = name; // Optional: store the username in session
                res.redirect('/mentor'); // Redirect to protected route
            } else {
                req.session.loggedIn = false;
                res.redirect('/?error=invalid'); // Handle wrong password scenario
            }
        } else {
            req.session.loggedIn = false;
            res.redirect('/?error=invalid'); // Handle no user found scenario
        }
    });
});

// Middleware to check if the user is logged in
function requireLogin(req, res, next) {
    if (req.session.loggedIn) {
        next(); // User is authenticated, proceed to the requested page
    } else {
        res.redirect('/'); // Redirect to login page if not authenticated
    }
}

// Handle GET request for the protected /mentor route
app.get('/mentor', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'protected', 'mentor.html')); // Serve mentor.html from 'protected' folder
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/'); // Redirect to homepage after logout
    });
});

// Serve leaderboard.html
app.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')); // Serve leaderboard.html from 'public' folder
});

// Fetch leaderboard data based on category
app.get('/api/leaderboard', (req, res) => {
    const category = req.query.category || 'All';
    // console.log(category);
    let query = `
        SELECT m.member_id, m.member_name AS name, 
               IFNULL(SUM(mp.task_points), 0) AS points
        FROM members m
        LEFT JOIN member_points mp ON m.member_id = mp.member_id
        LEFT JOIN tasks t ON mp.task_id = t.task_id
    `;

    if (category !== 'All') {
        query += ` WHERE t.task_domain = '${category}'`;
    }

    query += ` GROUP BY m.member_id, m.member_name ORDER BY points DESC;`;

    connection.query(query, (error, results) => {
        if (error) {
            console.error('Database query error:', error);
            return res.status(500).send('Error fetching leaderboard data');
        }
        res.json(results);
    });
});

// Endpoint to fetch member name suggestions based on input query
app.get('/api/search-members', (req, res) => {
    const query = req.query.query;
    const sql = 'SELECT member_name FROM members WHERE member_name LIKE ? LIMIT 5';
    connection.query(sql, [`%${query}%`], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ members: results });
    });
});

// Endpoint to get full member details by name
app.get('/api/get-member-details', (req, res) => {
    const memberName = req.query.name;
    const sql = 'SELECT * FROM members WHERE member_name = ?';
    connection.query(sql, [memberName], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length > 0) {
            res.json({ member: results[0] });
        } else {
            res.status(404).json({ message: 'Member not found' });
        }
    });
});

app.post('/api/add-member', (req, res) => {
    const { member_id, member_name, year_of_study, gender, mobile_numbers } = req.body;

    // console.log('Received data:', { member_id, member_name, year_of_study, gender, mobile_numbers });

    if (!member_id || !member_name || !year_of_study || !gender || !mobile_numbers) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Ensure member_id is lowercase
    const lowerCaseMemberId = member_id.trim().toLowerCase();

    // Check if the member ID already exists
    connection.query('SELECT member_id FROM members WHERE member_id = ?', [lowerCaseMemberId], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: 'Error checking member existence' });
        }

        if (results.length > 0) {
            // Member already exists
            res.json({ exists: true });
        } else {
            // Insert new member
            const query = 'INSERT INTO members (member_id, member_name, year_of_study, gender, mobile_numbers) VALUES (?, ?, ?, ?, ?)';
            connection.query(query, [lowerCaseMemberId, member_name, year_of_study, gender, mobile_numbers], (error) => {
                if (error) {
                    console.error('Database query error:', error);
                    return res.status(500).json({ error: 'Error adding member' });
                }
                res.json({ exists: false });
            });
        }
    });
});

// Endpoint to add a task
app.post('/api/add-task', (req, res) => {
    const { task_id, task_name, task_domain, task_description } = req.body;

    // Validate required fields
    if (!task_id || !task_name || !task_domain || !task_description) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Ensure task_id is lowercase
    const lowerCaseTaskId = task_id.trim().toLowerCase();

    // Check if the task ID already exists
    connection.query('SELECT task_id FROM tasks WHERE task_id = ?', [lowerCaseTaskId], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: 'Error checking task existence' });
        }

        if (results.length > 0) {
            // Task already exists
            res.json({ exists: true });
        } else {
            // Insert new task
            const query = 'INSERT INTO tasks (task_id, task_name, task_domain, task_description) VALUES (?, ?, ?, ?)';
            connection.query(query, [lowerCaseTaskId, task_name, task_domain, task_description], (error) => {
                if (error) {
                    console.error('Database query error:', error);
                    return res.status(500).json({ error: 'Error adding task' });
                }
                res.json({ exists: false });
            });
        }
    });
});

// Endpoint to fetch tasks by domain
app.get('/api/tasks-by-domain', (req, res) => {
    const domain = req.query.domain;
    const sql = `
        SELECT task_id, task_name 
        FROM tasks 
        WHERE task_domain = ?
    `;
    connection.query(sql, [domain], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ tasks: results });
    });
});

app.post('/api/update-points', (req, res) => {
    const { member_id, task_id, points } = req.body;

    if (!member_id || !task_id || !points) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if the member and task exist
    const checkQuery = `
        SELECT member_id, task_id 
        FROM members m 
        JOIN tasks t 
        WHERE m.member_id = ? AND t.task_id = ?
    `;
    connection.query(checkQuery, [member_id, task_id], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: 'Error checking member or task existence' });
        }

        if (results.length > 0) {
            // Check if entry already exists in member_points
            const recheck = `SELECT * FROM member_points WHERE member_id=? AND task_id=?`;
            connection.query(recheck, [member_id, task_id], (error, existingEntry) => {
                if (error) {
                    console.error('Database query error:', error);
                    return res.status(500).json({ error: 'Error checking points' });
                }

                if (existingEntry.length > 0) {
                    // Update points if record exists
                    const updateQuery = `
                        UPDATE member_points
                        SET task_points = ?
                        WHERE member_id = ? AND task_id = ?
                    `;
                    connection.query(updateQuery, [points, member_id, task_id], (updateError) => {
                        if (updateError) {
                            console.error('Database query error:', updateError);
                            return res.status(500).json({ error: 'Error updating points' });
                        }
                        return res.json({ success: true });
                    });
                } else {
                    // Insert new record if it doesn't exist
                    const insertQuery = `
                        INSERT INTO member_points (member_id, task_id, task_points)
                        VALUES (?, ?, ?)
                    `;
                    connection.query(insertQuery, [member_id, task_id, points], (insertError) => {
                        if (insertError) {
                            console.error('Database query error:', insertError);
                            return res.status(500).json({ error: 'Error inserting points' });
                        }
                        return res.json({ success: true });
                    });
                }
            });
        } else {
            return res.status(400).json({ error: 'Invalid member or task' });
        }
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
