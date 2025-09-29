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
					db.close()
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
					db.close()
					reject(err)
					return
				}
				console.log('Таблицы созданы успешно')
				db.close()
				resolve()
			}
		)
	})
}

// Получение подключения к БД с обработкой ошибок
function getDb() {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH, err => {
			if (err) {
				console.error('Ошибка подключения к БД:', err)
				reject(err)
			} else {
				resolve(db)
			}
		})
	})
}

// Утилита для безопасного закрытия БД
function closeDb(db) {
	if (db) {
		db.close(err => {
			if (err) {
				console.error('Ошибка закрытия БД:', err)
			}
		})
	}
}

// Валидация данных события
function validateEventData(data) {
	const { name, type, start, end } = data
	const errors = []

	if (!name || name.trim().length === 0) {
		errors.push('Название события обязательно')
	}
	if (!type || !['government', 'civilian', 'incident'].includes(type)) {
		errors.push('Некорректный тип события')
	}
	if (!start || isNaN(Date.parse(start))) {
		errors.push('Некорректная дата начала')
	}
	if (!end || isNaN(Date.parse(end))) {
		errors.push('Некорректная дата окончания')
	}
	if (start && end && new Date(start) >= new Date(end)) {
		errors.push('Дата начала должна быть раньше даты окончания')
	}

	return errors
}

// Проверка подключения
app.get('/api/events/ping', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Получение всех одобренных мероприятий
app.get('/api/events', async (req, res) => {
	let db
	try {
		db = await getDb()
		db.all(
			`SELECT * FROM events WHERE status = 'approved' ORDER BY createdAt DESC`,
			[],
			(err, rows) => {
				if (err) {
					console.error('Ошибка получения мероприятий:', err)
					res.status(500).json({ error: 'Ошибка при получении мероприятий' })
				} else {
					const events = rows.map(row => ({
						...row,
						isLine: Boolean(row.isLine),
					}))
					res.json(events)
				}
				closeDb(db)
			}
		)
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Получение мероприятий по типу
app.get('/api/events/type/:type', async (req, res) => {
	const { type } = req.params

	// Валидация типа
	if (!['government', 'civilian', 'incident'].includes(type)) {
		return res.status(400).json({ error: 'Некорректный тип события' })
	}

	let db
	try {
		db = await getDb()
		db.all(
			`SELECT * FROM events WHERE type = ? AND status = 'approved' ORDER BY createdAt DESC`,
			[type],
			(err, rows) => {
				if (err) {
					console.error('Ошибка получения мероприятий по типу:', err)
					res.status(500).json({ error: 'Ошибка при получении мероприятий' })
				} else {
					const events = rows.map(row => ({
						...row,
						isLine: Boolean(row.isLine),
					}))
					res.json(events)
				}
				closeDb(db)
			}
		)
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Добавление нового мероприятия в очередь
app.post('/api/events', async (req, res) => {
	const { name, type, start, end, description, x, y, x1, y1, x2, y2, isLine } =
		req.body

	// Валидация данных
	const validationErrors = validateEventData(req.body)
	if (validationErrors.length > 0) {
		return res.status(400).json({
			error: 'Ошибка валидации',
			details: validationErrors,
		})
	}

	// Проверка координат
	if (isLine) {
		if (
			x1 === undefined ||
			y1 === undefined ||
			x2 === undefined ||
			y2 === undefined
		) {
			return res
				.status(400)
				.json({ error: 'Для линии необходимы координаты двух точек' })
		}
	} else {
		if (x === undefined || y === undefined) {
			return res
				.status(400)
				.json({ error: 'Для точечного события необходимы координаты' })
		}
	}

	const createdAt = new Date().toISOString()

	let db
	try {
		db = await getDb()
		db.run(
			`INSERT INTO queue (name, type, start, end, description, x, y, x1, y1, x2, y2, isLine, status, createdAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
			[
				name.trim(),
				type,
				start,
				end,
				description?.trim() || '',
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
				} else {
					res.status(201).json({
						message: 'Событие добавлено в очередь на одобрение',
						event: {
							id: this.lastID,
							name: name.trim(),
							type,
							start,
							end,
							description: description?.trim() || '',
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
				}
				closeDb(db)
			}
		)
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Удаление мероприятия
app.delete('/api/events/:id', async (req, res) => {
	const eventId = parseInt(req.params.id)

	if (isNaN(eventId)) {
		return res.status(400).json({ error: 'Некорректный ID события' })
	}

	let db
	try {
		db = await getDb()
		db.run(`DELETE FROM events WHERE id = ?`, [eventId], function (err) {
			if (err) {
				console.error('Ошибка удаления мероприятия:', err)
				res.status(500).json({ error: 'Ошибка при удалении мероприятия' })
			} else if (this.changes === 0) {
				res.status(404).json({ error: 'Мероприятие не найдено' })
			} else {
				res.status(200).json({
					message: 'Мероприятие удалено',
					id: eventId,
				})
			}
			closeDb(db)
		})
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Получение списка событий в очереди
app.get('/api/queue', async (req, res) => {
	let db
	try {
		db = await getDb()
		db.all(`SELECT * FROM queue ORDER BY createdAt DESC`, [], (err, rows) => {
			if (err) {
				console.error('Ошибка получения очереди:', err)
				res.status(500).json({ error: 'Ошибка при получении очереди событий' })
			} else {
				const queue = rows.map(row => ({
					...row,
					isLine: Boolean(row.isLine),
				}))
				res.json(queue)
			}
			closeDb(db)
		})
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Одобрение события из очереди
app.post('/api/queue/:id/approve', async (req, res) => {
	const eventId = parseInt(req.params.id)

	if (isNaN(eventId)) {
		return res.status(400).json({ error: 'Некорректный ID события' })
	}

	let db
	try {
		db = await getDb()

		// Получаем событие из очереди
		db.get(`SELECT * FROM queue WHERE id = ?`, [eventId], (err, row) => {
			if (err) {
				console.error('Ошибка получения события:', err)
				res.status(500).json({ error: 'Ошибка при одобрении события' })
				closeDb(db)
				return
			}

			if (!row) {
				res.status(404).json({ error: 'Событие не найдено в очереди' })
				closeDb(db)
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
				'approved',
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
						closeDb(db)
						return
					}

					const newEventId = this.lastID

					// Удаляем из очереди
					db.run(`DELETE FROM queue WHERE id = ?`, [eventId], deleteErr => {
						if (deleteErr) {
							console.error('Ошибка удаления из очереди:', deleteErr)
							res.status(500).json({ error: 'Ошибка при очистке очереди' })
						} else {
							// Возвращаем одобренное событие с новым ID
							const approvedEvent = {
								...row,
								id: newEventId,
								isLine: Boolean(row.isLine),
								status: 'approved',
							}

							res.json({
								message: 'Событие одобрено',
								event: approvedEvent,
							})
						}
						closeDb(db)
					})
				}
			)
		})
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Отклонение события из очереди
app.post('/api/queue/:id/reject', async (req, res) => {
	const eventId = parseInt(req.params.id)
	const reason = req.body.reason?.trim() || 'Причина не указана'

	if (isNaN(eventId)) {
		return res.status(400).json({ error: 'Некорректный ID события' })
	}

	let db
	try {
		db = await getDb()

		// Сначала проверяем существование события
		db.get(`SELECT * FROM queue WHERE id = ?`, [eventId], (err, row) => {
			if (err) {
				console.error('Ошибка получения события:', err)
				res.status(500).json({ error: 'Ошибка при отклонении события' })
				closeDb(db)
				return
			}

			if (!row) {
				res.status(404).json({ error: 'Событие не найдено в очереди' })
				closeDb(db)
				return
			}

			// Удаляем отклоненное событие из очереди
			db.run(`DELETE FROM queue WHERE id = ?`, [eventId], deleteErr => {
				if (deleteErr) {
					console.error('Ошибка удаления отклоненного события:', deleteErr)
					res.status(500).json({ error: 'Ошибка при удалении события' })
				} else {
					res.json({
						message: 'Событие отклонено',
						reason: reason,
					})
				}
				closeDb(db)
			})
		})
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Обновление мероприятия
app.put('/api/events/:id', async (req, res) => {
	const eventId = parseInt(req.params.id)
	const { name, type, start, end, description, x, y, x1, y1, x2, y2, isLine } =
		req.body

	if (isNaN(eventId)) {
		return res.status(400).json({ error: 'Некорректный ID события' })
	}

	// Валидация данных
	const validationErrors = validateEventData(req.body)
	if (validationErrors.length > 0) {
		return res.status(400).json({
			error: 'Ошибка валидации',
			details: validationErrors,
		})
	}

	let db
	try {
		db = await getDb()
		db.run(
			`UPDATE events 
			 SET name = ?, type = ?, start = ?, end = ?, description = ?, 
			     x = ?, y = ?, x1 = ?, y1 = ?, x2 = ?, y2 = ?, isLine = ?
			 WHERE id = ?`,
			[
				name.trim(),
				type,
				start,
				end,
				description?.trim() || '',
				x || null,
				y || null,
				x1 || null,
				y1 || null,
				x2 || null,
				y2 || null,
				isLine ? 1 : 0,
				eventId,
			],
			function (err) {
				if (err) {
					console.error('Ошибка обновления мероприятия:', err)
					res.status(500).json({ error: 'Ошибка при обновлении мероприятия' })
				} else if (this.changes === 0) {
					res.status(404).json({ error: 'Мероприятие не найдено' })
				} else {
					res.json({
						message: 'Мероприятие обновлено',
						id: eventId,
					})
				}
				closeDb(db)
			}
		)
	} catch (error) {
		console.error('Ошибка подключения к БД:', error)
		res.status(500).json({ error: 'Ошибка подключения к базе данных' })
		closeDb(db)
	}
})

// Автоматическое удаление истекших мероприятий
async function removeExpiredEvents() {
	let db
	try {
		db = await getDb()
		const now = new Date().toISOString()

		db.run(
			`DELETE FROM events WHERE end < ? AND status = 'approved'`,
			[now],
			function (err) {
				if (err) {
					console.error('Ошибка удаления истекших мероприятий:', err)
				} else if (this.changes > 0) {
					console.log(
						`[${new Date().toLocaleString(
							'ru-RU'
						)}] Удалено истекших мероприятий: ${this.changes}`
					)
				}
				closeDb(db)
			}
		)
	} catch (error) {
		console.error('Ошибка при удалении истекших событий:', error)
		closeDb(db)
	}
}

// Запуск очистки в 4:00 МСК
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

	console.log(
		`Следующая ежедневная очистка через ${Math.round(
			timeToNextCleanup / 1000 / 60
		)} минут`
	)

	setTimeout(() => {
		console.log('[ЕЖЕДНЕВНАЯ ОЧИСТКА] Запуск в 4:00 МСК')
		removeExpiredEvents()
		scheduleDailyCleanup()
	}, timeToNextCleanup)
}

// Обработка ошибок на уровне приложения
app.use((err, req, res, next) => {
	console.error('Необработанная ошибка:', err)
	res.status(500).json({ error: 'Внутренняя ошибка сервера' })
})

// Запуск сервера
async function startServer() {
	try {
		await initDatabase()

		app.listen(PORT, '0.0.0.0', () => {
			console.log(`====================================`)
			console.log(`Сервер запущен на порту ${PORT}`)
			console.log(`Время запуска: ${new Date().toLocaleString('ru-RU')}`)
			console.log(`====================================`)

			// Запускаем периодическую очистку каждые 5 минут
			setInterval(removeExpiredEvents, 5 * 60 * 1000)
			console.log('✓ Автоматическая очистка истекших событий: каждые 5 минут')

			// Планируем ежедневную очистку в 4:00 МСК
			scheduleDailyCleanup()
			console.log('✓ Ежедневная очистка запланирована на 4:00 МСК')
		})
	} catch (error) {
		console.error('Критическая ошибка запуска сервера:', error)
		process.exit(1)
	}
}

// Graceful shutdown
process.on('SIGINT', () => {
	console.log('\n Получен сигнал SIGINT, завершение работы...')
	process.exit(0)
})

process.on('SIGTERM', () => {
	console.log('\n Получен сигнал SIGTERM, завершение работы...')
	process.exit(0)
})

startServer()
