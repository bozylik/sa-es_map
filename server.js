@@ -1,464 +1,469 @@
const express = require('express')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const app = express()
const PORT = 3000
const DB_PATH = path.join(__dirname, 'gtamap.db')

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static('public'))
app.use(express.static('.'))

// Маршрут для корневой страницы
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'))
})

// Маршрут для мобильной версии
app.get('/mobile', (req, res) => {
	res.sendFile(path.join(__dirname, 'mobile.html'))
})

// Инициализация базы данных SQLite
function initDatabase() {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH, err => {
			if (err) {
				console.error('Ошибка подключения к БД:', err)
				reject(err)
				return
			}
			console.log('Подключение к SQLite установлено')
		})

		// Создаем таблицу events если её нет
		db.run(
			`CREATE TABLE IF NOT EXISTS events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				type TEXT NOT NULL,
				start TEXT NOT NULL,
				end TEXT NOT NULL,
				description TEXT,
				x REAL,
				y REAL,
				x1 REAL,
				y1 REAL,
				x2 REAL,
				y2 REAL,
				isLine INTEGER DEFAULT 0,
				status TEXT DEFAULT 'approved',
				createdAt TEXT NOT NULL
			)`,
			err => {
				if (err) {
					console.error('Ошибка создания таблицы events:', err)
					reject(err)
					return
				}
			}
		)

		// Создаем таблицу queue если её нет
		db.run(
			`CREATE TABLE IF NOT EXISTS queue (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				type TEXT NOT NULL,
				start TEXT NOT NULL,
				end TEXT NOT NULL,
				description TEXT,
				x REAL,
				y REAL,
				x1 REAL,
				y1 REAL,
				x2 REAL,
				y2 REAL,
				isLine INTEGER DEFAULT 0,
				status TEXT DEFAULT 'pending',
				createdAt TEXT NOT NULL,
				rejectionReason TEXT
			)`,
			err => {
				if (err) {
					console.error('Ошибка создания таблицы queue:', err)
					reject(err)
					return
				}
				console.log('Таблицы созданы успешно')
				resolve(db)
			}
		)
	})
}

// Получение подключения к БД
function getDb() {
	return new sqlite3.Database(DB_PATH)
}

// Проверка подключения
app.get('/api/events/ping', (req, res) => {
	res.json({ status: 'ok' })
})

// Получение всех мероприятий
app.get('/api/events', (req, res) => {
	const db = getDb()
	db.all(
		`SELECT * FROM events WHERE status = 'approved' ORDER BY createdAt DESC`,
		[],
		(err, rows) => {
			if (err) {
				console.error('Ошибка получения мероприятий:', err)
				res.status(500).json({ error: 'Ошибка при получении мероприятий' })
				db.close()
				return
			}

			const events = rows.map(row => ({
				...row,
				isLine: Boolean(row.isLine),
			}))

			res.json(events)
			db.close()
		}
	)
})

// Получение мероприятий по типу
app.get('/api/events/type/:type', (req, res) => {
	const db = getDb()
	db.all(
		`SELECT * FROM events WHERE type = ? AND status = 'approved' ORDER BY createdAt DESC`,
		[req.params.type],
		(err, rows) => {
			if (err) {
				console.error('Ошибка получения мероприятий по типу:', err)
				res
					.status(500)
					.json({ error: 'Ошибка при получении мероприятий по типу' })
				db.close()
				return
			}

			const events = rows.map(row => ({
				...row,
				isLine: Boolean(row.isLine),
			}))

			res.json(events)
			db.close()
		}
	)
})

// Добавление нового мероприятия в очередь
app.post('/api/events', (req, res) => {
	const db = getDb()
	const { name, type, start, end, description, x, y, x1, y1, x2, y2, isLine } =
		req.body

	const createdAt = new Date().toISOString()

	db.run(
		`INSERT INTO queue (name, type, start, end, description, x, y, x1, y1, x2, y2, isLine, status, createdAt)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
		[
			name,
			type,
			start,
			end,
			description || '',
			x || null,
			y || null,
			x1 || null,
			y1 || null,
			x2 || null,
			y2 || null,
			isLine ? 1 : 0,
			createdAt,
		],
		function (err) {
			if (err) {
				console.error('Ошибка добавления в очередь:', err)
				res
					.status(500)
					.json({ error: 'Ошибка при добавлении события в очередь' })
				db.close()
				return
			}
			res.status(201).json({
				message: 'Событие добавлено в очередь на одобрение',
				event: {
					id: this.lastID,
					name,
					type,
					start,
					end,
					description,
					x,
					y,
					x1,
					y1,
					x2,
					y2,
					isLine,
					status: 'pending',
					createdAt,
				},
			})
			db.close()
		}
	)
})

// Удаление мероприятия
app.delete('/api/events/:id', (req, res) => {
	const db = getDb()
	db.run(`DELETE FROM events WHERE id = ?`, [req.params.id], function (err) {
		if (err) {
			console.error('Ошибка удаления мероприятия:', err)
			res.status(500).json({ error: 'Ошибка при удалении мероприятия' })
			db.close()
			return
		}
		res.status(200).json({ message: 'Мероприятие удалено' })
		db.close()
	})
})

// Получение списка событий в очереди
app.get('/api/queue', (req, res) => {
	const db = getDb()
	db.all(`SELECT * FROM queue ORDER BY createdAt DESC`, [], (err, rows) => {
		if (err) {
			console.error('Ошибка получения очереди:', err)
			res.status(500).json({ error: 'Ошибка при получении очереди событий' })
			db.close()
			return
		}
		const queue = rows.map(row => ({
			...row,
			isLine: Boolean(row.isLine),
		}))
		res.json(queue)
		db.close()
	})
})

// Одобрение события из очереди
app.post('/api/queue/:id/approve', (req, res) => {
	const db = getDb()
	const eventId = parseInt(req.params.id)

	// Получаем событие из очереди
	db.get(`SELECT * FROM queue WHERE id = ?`, [eventId], (err, row) => {
		if (err) {
			console.error('Ошибка получения события:', err)
			res.status(500).json({ error: 'Ошибка при одобрении события' })
			db.close()
			return
		}

		if (!row) {
			res.status(404).json({ error: 'Событие не найдено в очереди' })
			db.close()
			return
		}

		// Добавляем в основную таблицу
		const eventFields = [
			row.name,
			row.type,
			row.start,
			row.end,
			row.description,
			row.x,
			row.y,
			row.x1,
			row.y1,
			row.x2,
			row.y2,
			row.isLine,
			'approved', // status
			row.createdAt,
		]

		db.run(
			`INSERT INTO events (name, type, start, end, description, x, y, x1, y1, x2, y2, isLine, status, createdAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			eventFields,
			function (insertErr) {
				if (insertErr) {
					console.error('Ошибка добавления события:', insertErr)
					res.status(500).json({ error: 'Ошибка при одобрении события' })
					db.close()
					return
				}

				// Удаляем из очереди
				db.run(`DELETE FROM queue WHERE id = ?`, [eventId], deleteErr => {
					if (deleteErr) {
						console.error('Ошибка удаления из очереди:', deleteErr)
					}

					// Возвращаем одобренное событие с правильным ID
					const approvedEvent = {
						...row,
						id: this.lastID, // Используем ID из вставленной записи
						status: 'approved',
					}

					res.json({
						message: 'Событие одобрено',
						event: approvedEvent,
					})
					db.close()
				})
			}
		)
	})
})

// Отклонение события из очереди
app.post('/api/queue/:id/reject', (req, res) => {
	const db = getDb()
	const eventId = parseInt(req.params.id)
	const reason = req.body.reason || 'Причина не указана'

	db.run(
		`UPDATE queue SET status = 'rejected', rejectionReason = ? WHERE id = ?`,
		[reason, eventId],
		function (err) {
			if (err) {
				console.error('Ошибка отклонения события:', err)
				res.status(500).json({ error: 'Ошибка при отклонении события' })
				db.close()
				return
			}

			if (this.changes === 0) {
				res.status(404).json({ error: 'Событие не найдено в очереди' })
				db.close()
				return
			}

			// Удаляем отклоненное событие из очереди
			db.run(`DELETE FROM queue WHERE id = ?`, [eventId], deleteErr => {
				if (deleteErr) {
					console.error('Ошибка удаления отклоненного события:', deleteErr)
				}
				res.json({ message: 'Событие отклонено' })
				db.close()
			})
		}
	)
})

// Обновление мероприятия
app.put('/api/events/:id', (req, res) => {
	const db = getDb()
	const { name, type, start, end, description, x, y, x1, y1, x2, y2, isLine } =
		req.body

	db.run(
		`UPDATE events 
		 SET name = ?, type = ?, start = ?, end = ?, description = ?, 
		     x = ?, y = ?, x1 = ?, y1 = ?, x2 = ?, y2 = ?, isLine = ?
		 WHERE id = ?`,
		[
			name,
			type,
			start,
			end,
			description,
			x || null,
			y || null,
			x1 || null,
			y1 || null,
			x2 || null,
			y2 || null,
			isLine ? 1 : 0,
			req.params.id,
		],
		function (err) {
			if (err) {
				console.error('Ошибка обновления мероприятия:', err)
				res.status(500).json({ error: 'Ошибка при обновлении мероприятия' })
				db.close()
				return
			}

			if (this.changes === 0) {
				res.status(404).json({ error: 'Мероприятие не найдено' })
				db.close()
				return
			}

			res.json({ message: 'Мероприятие обновлено', id: req.params.id })
			db.close()
		}
	)
})

// Автоматическое удаление истекших мероприятий
function removeExpiredEvents() {
	const db = getDb()
	const now = new Date().toISOString()

	db.run(
		`DELETE FROM events WHERE end < ? AND status = 'approved'`,
		[now],
		function (err) {
			if (err) {
				console.error('Ошибка удаления истекших мероприятий:', err)
			} else if (this.changes > 0) {
				console.log(`Удалено истекших мероприятий: ${this.changes}`)
			}
			db.close()
		}
	)
}

// Запуск очистки каждые 5 минут и в 4:00 МСК
function scheduleDailyCleanup() {
	const now = new Date()
	const mskOffset = 3
	const targetHour = 4

	const mskHour = (now.getUTCHours() + mskOffset) % 24
	const mskMinutes = now.getUTCMinutes()

	let timeToNextCleanup
	if (mskHour < targetHour || (mskHour === targetHour && mskMinutes === 0)) {
		timeToNextCleanup = ((targetHour - mskHour) * 60 - mskMinutes) * 60 * 1000
	} else {
		timeToNextCleanup =
			((24 - mskHour + targetHour) * 60 - mskMinutes) * 60 * 1000
	}

	setTimeout(() => {
		removeExpiredEvents()
		scheduleDailyCleanup()
	}, timeToNextCleanup)
}

// Запуск сервера
async function startServer() {
	try {
		await initDatabase()

		app.listen(PORT, '0.0.0.0', () => {
			console.log(`Сервер запущен на порту ${PORT}`)
			// Запускаем периодическую очистку
			setInterval(removeExpiredEvents, 5 * 60 * 1000) // Каждые 5 минут
			scheduleDailyCleanup() // Планируем ежедневную очистку в 4:00 МСК
		})
	} catch (error) {
		console.error('Ошибка запуска сервера:', error)
		process.exit(1)
	}
}

startServer()