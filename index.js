import puppeteer from 'puppeteer-core'
import dotenv from 'dotenv'
import { Webhook, MessageBuilder } from 'webhook-discord'
import { DateTime } from 'luxon'

dotenv.config()

const config = {
	isaLoginButtonId: id('wayf_submit_button'),
	switchLoginButtonId: id('login-button'),
	switchUsernameFieldId: id('username'),
	switchPasswordFieldId: id('password'),
	waitForISA: id('main'),
	isaResultsTab: `${id('onglet')} > ul > li:nth-child(2)`,
	isaCurrentYearLink: `.blocinfobody > ul > li > a`,
	isaNotesTables: 'table.cc-inscr-matieres > *',
}

const hook = new Webhook(process.env.DISCORD_WEBHOOK)
const discordMessage = new MessageBuilder()
	.setName('Fuck IS-Academia')
	.setColor('#ff0000')
	.setURL(process.env.ISA_URL)
	.setTitle('Alerte nouvelle note')
	.addField(
		'...',
		'[https://github.com/Xstoudi/is-academia-discord-alert](sources)'
	)

function id(identifier) {
	return `#${identifier}`
}

function timeout(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendAwake() {
	const wakeUpMessage = new MessageBuilder()
		.setName('Fuck IS-Academia')
		.setColor('#0269A4')
		.setURL(process.env.ISA_URL)
		.setTitle('Up and running')
		.addField(
			'...',
			'[https://github.com/Xstoudi/is-academia-discord-alert](sources)'
		)
	hook.send(wakeUpMessage)
}

async function fetchGrades() {
	await page.goto(process.env.ISA_URL)
	await page.waitForSelector(config.isaLoginButtonId)
	await page.click(config.isaLoginButtonId)

	await page.waitForSelector(config.switchLoginButtonId)
	await page.focus(config.switchUsernameFieldId)
	await page.keyboard.type(process.env.SWITCH_EMAIL)
	await page.focus(config.switchPasswordFieldId)
	await page.keyboard.type(process.env.SWITCH_PASSWORD)

	await page.click(config.switchLoginButtonId)
	await page.waitForTimeout(3000)

	await page.click(config.isaResultsTab)
	await page.waitForSelector(config.isaCurrentYearLink)
	await page.click(config.isaCurrentYearLink)
	await page.waitForSelector(config.isaNotesTables)

	const currentGrades = await page.$$eval(config.isaNotesTables, elements => {
		const currentGrades = {}
		elements
			.filter(({ nodeName }) => nodeName === 'THEAD' || nodeName === 'TBODY')
			.forEach(element => {
				if (element.nodeName === 'THEAD') {
					currentGrades[element.firstChild.firstChild.textContent.trim()] = []
				} else if (element.nodeName === 'TBODY') {
					const subjects = Object.keys(currentGrades)
					console.log(subjects[subjects.length - 1])
					for (const [
						identifier,
						child,
					] of element.firstChild.childNodes.entries()) {
						if (identifier < 3) continue

						const grade = parseFloat(child.textContent)
						if (isNaN(grade)) continue
						currentGrades[subjects[subjects.length - 1]].push(grade)
					}
				}
			})
		return currentGrades
	})

	return currentGrades
}

async function diffGrades(currentGrades, oldGrades) {
	return Object.keys(currentGrades).filter(
		subject => currentGrades[subject].length > oldGrades[subject].length
	)
}

async function main() {
	let oldGrades = await fetchGrades()
	while (true) {
		const newGrades = await fetchGrades()
		const subjects = await diffGrades(newGrades, oldGrades)

		for (const subject of subjects) {
			discordMessage.setDescription(
				`Nouvelle note dans la matière suivante :\n**${subject}**`
			)
			await hook.send(discordMessage)
		}
		oldGrades = newGrades
		console.log(
			`Done at (${DateTime.now()
				.setLocale('fr')
				.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)})`
		)
		await timeout(60000)
	}
}

const browser = await puppeteer.launch({
	pipe: true,
	executablePath: '/usr/bin/chromium-browser',
	args: ['--no-sandbox'],
})
const page = await browser.newPage()

try {
	await sendAwake()
	await main()
} catch (err) {
	await browser.close()
}
