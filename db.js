// База данных для хранения мероприятий
class EventDatabase {
	constructor() {
		// Базовый URL для API
		this.apiUrl = '/api'
		this.eventsUrl = `${this.apiUrl}/events`
		this.queueUrl = `${this.apiUrl}/queue`
	}

	// Инициализация подключения к серверной БД
	async init() {
		try {
			const response = await fetch(this.eventsUrl + '/ping')
			if (!response.ok) throw new Error('Сервер не отвечает')
			console.log('Подключение к серверу установлено')
			return true
		} catch (error) {
			console.error('Ошибка подключения к серверу:', error)
			throw error
		}
	}

	// Добавление нового мероприятия
	async addEvent(event) {
		try {
			const response = await fetch(this.eventsUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(event),
			})

			if (!response.ok) throw new Error('Не удалось добавить мероприятие')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при добавлении мероприятия:', error)
			throw error
		}
	}

	// Удаление мероприятия по ID
	async deleteEvent(id) {
		try {
			const response = await fetch(`${this.eventsUrl}/${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) throw new Error('Не удалось удалить мероприятие')
			return true
		} catch (error) {
			console.error('Ошибка при удалении мероприятия:', error)
			throw error
		}
	}

	// Получение всех мероприятий
	async getAllEvents() {
		try {
			const response = await fetch(this.eventsUrl)
			if (!response.ok) throw new Error('Не удалось получить мероприятия')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при получении мероприятий:', error)
			throw error
		}
	}

	// Обновление мероприятия
	async updateEvent(event) {
		try {
			const response = await fetch(`${this.eventsUrl}/${event.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(event),
			})

			if (!response.ok) throw new Error('Не удалось обновить мероприятие')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при обновлении мероприятия:', error)
			throw error
		}
	}

	// Получение мероприятий по типу
	async getEventsByType(type) {
		try {
			const response = await fetch(`${this.eventsUrl}/type/${type}`)
			if (!response.ok)
				throw new Error('Не удалось получить мероприятия по типу')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при получении мероприятий по типу:', error)
			throw error
		}
	}

	// Получение событий из очереди
	async getQueuedEvents() {
		try {
			const response = await fetch(this.queueUrl)
			if (!response.ok)
				throw new Error('Не удалось получить события из очереди')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при получении событий из очереди:', error)
			throw error
		}
	}

	// Одобрение события из очереди
	async approveEvent(id) {
		try {
			const response = await fetch(`${this.queueUrl}/${id}/approve`, {
				method: 'POST',
			})
			if (!response.ok) throw new Error('Не удалось одобрить событие')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при одобрении события:', error)
			throw error
		}
	}

	// Отклонение события из очереди
	async rejectEvent(id, reason) {
		try {
			const response = await fetch(`${this.queueUrl}/${id}/reject`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ reason }),
			})
			if (!response.ok) throw new Error('Не удалось отклонить событие')
			return await response.json()
		} catch (error) {
			console.error('Ошибка при отклонении события:', error)
			throw error
		}
	}
}
