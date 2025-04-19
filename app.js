const express = require('express')
const app = express()
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())

let db = null

const dbpath = path.join(__dirname, 'covid19IndiaPortal.db')
const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server startting at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB error: ${error.message}`)
    process.exit(1)
  }
}
initializeDBandServer()

const convertStateDatabaseObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convert_districtDbObjectTo_ResponsiveObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
     SELECT *
     FROM user
     WHERE username = '${username}';
   `
  const databaseUser = await db.get(selectUserQuery)
  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticateToken, async (request, response) => {
  const getStateQuery = `
  SELECT * FROM state;`
  const stateArray = await db.all(getStateQuery)
  response.send(
    stateArray.map(eachState =>
      convertStateDatabaseObjectToResponseObject(eachState),
    ),
  )
})

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
        SELECT * FROM state WHERE
        state_id = ${stateId};
      `
  const state = await db.get(getStateQuery)
  response.send(convertStateDatabaseObjectToResponseObject(state))
})

app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const PostDistrictQuery = `
      INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
      VALUES('${districtName}',${stateId},${cases},${cured},${active},${deaths});
    `
  await db.run(PostDistrictQuery)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictVal = `
    SELECT * FROM district WHERE district_id=${districtId};
    `
    const districtVal = await db.get(getDistrictVal)
    response.send(convert_districtDbObjectTo_ResponsiveObject(districtVal))
  },
)

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteIdBased = `
    DELETE FROM district WHERE district_id=${districtId};
    `
    await db.run(deleteIdBased)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
      UPDATE district
      SET
        district_name='${districtName}',
        state_id=${stateId},
        cases=${cases},
        cured=${cured},
        active=${active},
        deaths=${deaths}
      WHERE district_id = ${districtId};`

    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const totalValues = `
    SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
     FROM district
     WHERE state_id=${stateId};`

    const stateStats = await db.get(totalValues)
    response.send({
      totalCases: stateStats['SUM(cases)'],
      totalCured: stateStats['SUM(cured)'],
      totalActive: stateStats['SUM(active)'],
      totalDeaths: stateStats['SUM(deaths)'],
    })
  },
)
module.exports = app
