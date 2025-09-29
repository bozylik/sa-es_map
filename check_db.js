const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, 'gtamap.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        return;
    }
    console.log('Connected to the gtamap database.');
});

// Check tables in the database
db.serialize(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error('Error retrieving tables:', err.message);
            return;
        }
        
        console.log('Tables in database:');
        tables.forEach(table => {
            console.log('- ' + table.name);
            
            // Get table structure
            db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
                if (err) {
                    console.error('Error retrieving table info:', err.message);
                    return;
                }
                
                console.log(`Structure of ${table.name}:`);
                columns.forEach(column => {
                    console.log(`  ${column.name} (${column.type}) ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''}`);
                });
            });
        });
    });
});

// Close the database connection
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
}, 1000);