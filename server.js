const express = require('express')
const cors = require('cors')
const fs = require('fs').promises
const path = require('path')

const app = express()
const PORT = 3000
const DB_PATH = path.join(__dirname, 'events.json')
const QUEUE_PATH = path.join(__dirname, 'queue.json')

app.use(cors())
app.use(express.json())
app.use(express.static('.'))

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'))
})

// Инициализация БД
async function initDatabase() {
	try {
		await fs.access(DB_PATH)
	} catch {
		await fs.writeFile(DB_PATH, JSON.stringify([]))
	}
	
	// Инициализация очереди
	try {
		await fs.access(QUEUE_PATH)
	} catch {
		await fs.writeFile(QUEUE_PATH, JSON.stringify([]))
	}
}

// Чтение/запись
async function readEvents() {
	const data = await fs.readFile(DB_PATH, 'utf8')
	return JSON.parse(data)
}

async function writeEvents(events) {
	await fs.writeFile(DB_PATH, JSON.stringify(events, null, 2))
}

async function readQueue() {
	try {
		const data = await fs.readFile(QUEUE_PATH, 'utf8')
		return JSON.parse(data)
	} catch (err) {
		if (err.code === 'ENOENT') {
			await fs.writeFile(QUEUE_PATH, '[]')
			return []
		}
		throw err
	}
}

async function writeQueue(queue) {
	await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2))
}

// API
app.get('/api/events/ping', (req, res) => res.json({ status: 'ok' }))

app.get('/api/events', async (req, res) => {
	try {
		res.json(await readEvents())
	} catch (err) {
		res.status(500).json({ error: 'Ошибка загрузки мероприятий' })
	}
})

app.get('/api/events/type/:type', async (req, res) => {
	try {
		const events = await readEvents()
		res.json(events.filter(e => e.type === req.params.type))
	} catch (err) {
		res.status(500).json({ error: 'Ошибка фильтрации' })
	}
})

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
		res.status(201).json({ message: 'Добавлено в очередь', event: newEvent })
	} catch (err) {
		res.status(500).json({ error: 'Ошибка добавления' })
	}
})

app.delete('/api/events/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const events = await readEvents()
		const filtered = events.filter(e => e.id !== id)
		await writeEvents(filtered)
		res.json({ message: 'Удалено' })
	} catch (err) {
		res.status(500).json({ error: 'Ошибка удаления' })
	}
})

app.put('/api/events/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const events = await readEvents()
		const index = events.findIndex(e => e.id === id)
		if (index === -1) return res.status(404).json({ error: 'Не найдено' })
		events[index] = { ...req.body, id }
		await writeEvents(events)
		res.json(events[index])
	} catch (err) {
		res.status(500).json({ error: 'Ошибка обновления' })
	}
})

app.get('/api/queue', async (req, res) => {
	try {
		res.json(await readQueue())
	} catch (err) {
		res.status(500).json({ error: 'Ошибка загрузки очереди' })
	}
})

app.post('/api/queue/:id/approve', async (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const queue = await readQueue()
		const events = await readEvents()
		const idx = queue.findIndex(e => e.id === id)
		if (idx === -1) return res.status(404).json({ error: 'Не в очереди' })

		const event = { ...queue[idx], status: 'approved' }
		events.push(event)
		queue.splice(idx, 1)

		await writeQueue(queue)
		await writeEvents(events)
		res.json({ message: 'Одобрено', event })
	} catch (err) {
		res.status(500).json({ error: 'Ошибка одобрения' })
	}
})

app.post('/api/queue/:id/reject', async (req, res) => {
	try {
		const id = parseInt(req.params.id)
		const queue = await readQueue()
		const idx = queue.findIndex(e => e.id === id)
		if (idx === -1) return res.status(404).json({ error: 'Не в очереди' })

		const event = {
			...queue[idx],
			status: 'rejected',
			rejectionReason: req.body.reason || 'Не указана',
		}
		queue.splice(idx, 1)
		await writeQueue(queue)
		res.json({ message: 'Отклонено', event })
	} catch (err) {
		res.status(500).json({ error: 'Ошибка отклонения' })
	}
})

// Очистка истёкших
async function removeExpiredEvents() {
	try {
		const events = await readEvents()
		const now = new Date()
		const active = events.filter(e => new Date(e.end) > now)
		if (active.length !== events.length) {
			await writeEvents(active)
			console.log('🧹 Удалены истёкшие мероприятия')
		}
	} catch (err) {
		console.error('Ошибка очистки:', err)
	}
}

// Запуск
async function start() {
	await initDatabase()
	app.listen(PORT, () => {
		console.log(`🚀 Сервер запущен на http://localhost:${PORT}`)
		setInterval(removeExpiredEvents, 5 * 60 * 1000)
	})
}

start().catch(console.error)
