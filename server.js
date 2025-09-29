const express = require('express')
const cors = require('cors')
const fs = require('fs').promises
const path = require('path')

const app = express()
const PORT = 3000
const DB_PATH = path.join(__dirname, 'events.json')
const QUEUE_PATH = path.join(__dirname, 'queue.json')

// Middleware
app.use(cors()) // Разрешаем CORS для всех источников
app.use(express.json())
app.use(express.static('public'))
app.use(express.static('.')) // Раздаем статические файлы из текущей директории

// Маршрут для корневой страницы
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'))
})

// Инициализация базы данных
async function initDatabase() {
	try {
		await fs.access(DB_PATH)
	} catch {
		// Если файл не существует, создаем его с пустым массивом
		await fs.writeFile(DB_PATH, JSON.stringify([]))
	}
}

// Вспомогательные функции для работы с базой данных
async function readEvents() {
	const data = await fs.readFile(DB_PATH, 'utf-8')
	return JSON.parse(data)
}

async function writeEvents(events) {
	try {
		await fs.writeFile(DB_PATH, JSON.stringify(events, null, 2))
	} catch (error) {
		if (error.code === 'ENOENT') {
			await fs.writeFile(DB_PATH, '[]')
		}
		throw error
	}
}

// Вспомогательные функции для работы с очередью
async function readQueue() {
	try {
		const data = await fs.readFile(QUEUE_PATH, 'utf-8')
		return JSON.parse(data)
	} catch (error) {
		if (error.code === 'ENOENT') {
			await fs.writeFile(QUEUE_PATH, '[]')
			return []
		}
		throw error
	}
}

async function writeQueue(queue) {
	await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2))
}

// Проверка подключения
app.get('/api/events/ping', (req, res) => {
	res.json({ status: 'ok' })
})

// Получение всех мероприятий
app.get('/api/events', async (req, res) => {
	try {
		const events = await readEvents()
		res.json(events)
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при получении мероприятий' })
	}
})

// Получение мероприятий по типу
app.get('/api/events/type/:type', async (req, res) => {
	try {
		const events = await readEvents()
		const filteredEvents = events.filter(
			event => event.type === req.params.type
		)
		res.json(filteredEvents)
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при получении мероприятий по типу' })
	}
})

// Добавление нового мероприятия в очередь
app.post('/api/events', async (req, res) => {
	try {
		const queue = await readQueue()
		const newEvent = {
			...req.body,
			id: Date.now(),
			status: 'pending',
			createdAt: new Date().toISOString(),
		}
		queue.push(newEvent)
		await writeQueue(queue)
		res.status(201).json({
			message: 'Событие добавлено в очередь на одобрение',
			event: newEvent,
		})
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при добавлении события в очередь' })
	}
})

// Удаление мероприятия
app.delete('/api/events/:id', async (req, res) => {
	try {
		const events = await readEvents()
		const filteredEvents = events.filter(
			event => event.id !== parseInt(req.params.id)
		)
		await writeEvents(filteredEvents)
		res.status(200).json({ message: 'Мероприятие удалено' })
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при удалении мероприятия' })
	}
})

// Обновление мероприятия
// Получение списка событий в очереди
app.get('/api/queue', async (req, res) => {
	try {
		const queue = await readQueue()
		res.json(queue)
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при получении очереди событий' })
	}
})

// Одобрение события из очереди
app.post('/api/queue/:id/approve', async (req, res) => {
	try {
		const queue = await readQueue()
		const events = await readEvents()

		const eventIndex = queue.findIndex(
			event => event.id === parseInt(req.params.id)
		)
		if (eventIndex === -1) {
			return res.status(404).json({ error: 'Событие не найдено в очереди' })
		}

		const event = queue[eventIndex]
		event.status = 'approved'
		events.push(event)

		queue.splice(eventIndex, 1)

		await writeQueue(queue)
		await writeEvents(events)

		res.json({ message: 'Событие одобрено', event })
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при одобрении события' })
	}
})

// Отклонение события из очереди
app.post('/api/queue/:id/reject', async (req, res) => {
	try {
		const queue = await readQueue()
		const eventIndex = queue.findIndex(
			event => event.id === parseInt(req.params.id)
		)

		if (eventIndex === -1) {
			return res.status(404).json({ error: 'Событие не найдено в очереди' })
		}

		const event = queue[eventIndex]
		event.status = 'rejected'
		event.rejectionReason = req.body.reason || 'Причина не указана'

		queue.splice(eventIndex, 1)
		await writeQueue(queue)

		res.json({ message: 'Событие отклонено', event })
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при отклонении события' })
	}
})

app.put('/api/events/:id', async (req, res) => {
	try {
		const events = await readEvents()
		const index = events.findIndex(
			event => event.id === parseInt(req.params.id)
		)
		if (index === -1) {
			return res.status(404).json({ error: 'Мероприятие не найдено' })
		}
		events[index] = { ...req.body, id: parseInt(req.params.id) }
		await writeEvents(events)
		res.json(events[index])
	} catch (error) {
		res.status(500).json({ error: 'Ошибка при обновлении мероприятия' })
	}
})

// Автоматическое удаление истекших мероприятий
async function removeExpiredEvents() {
	try {
		const events = await readEvents()
		const now = new Date()
		const activeEvents = events.filter(event => new Date(event.endTime) > now)
		if (activeEvents.length !== events.length) {
			await writeEvents(activeEvents)
			console.log('Истекшие мероприятия удалены')
		}
	} catch (error) {
		console.error('Ошибка при удалении истекших мероприятий:', error)
	}
}

// Запуск очистки каждые 5 минут и в 4:00 МСК
function scheduleDailyCleanup() {
	const now = new Date()
	const mskOffset = 3 // МСК = UTC+3
	const targetHour = 4 // 4:00

	// Вычисляем время до следующей очистки
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
	await initDatabase()
	app.listen(PORT, () => {
		console.log(`Сервер запущен на порту ${PORT}`)
		// Запускаем периодическую очистку
		setInterval(removeExpiredEvents, 5 * 60 * 1000) // Каждые 5 минут
		scheduleDailyCleanup() // Планируем ежедневную очистку в 4:00 МСК
	})
}

startServer().catch(console.error)
