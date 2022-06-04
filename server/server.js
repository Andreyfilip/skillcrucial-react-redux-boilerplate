import express, { response } from 'express'
import path from 'path'
import cors from 'cors'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'
import axios from 'axios'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

const { readFile, writeFile, unlink } = require('fs').promises

require('colors')

let Root
try {
  // eslint-disable-next-line import/no-unresolved
  Root = require('../dist/assets/js/ssr/root.bundle').default
} catch {
  console.log('SSR not found. Please run "yarn run build:ssr"'.red)
}

let connections = []

const port = process.env.PORT || 8090
const server = express()


const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  express.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

const globalUrl = 'https://jsonplaceholder.typicode.com/users'
const globalPatch = `${__dirname}/data/users.json`

const getData = (url) => {
  const usersList = axios(url)
   .then(({data}) => {
     return data
   })
   .catch((err) => {
     console.log(err)
     return []
   })
   return usersList
}

server.get('/api/v1/users', async (req, res) => {
  const usersList = await readFile(globalPatch, 'utf-8')
  .then((usersData) => {
    return JSON.parse(usersData)
  })
  .catch (async (err) => {
    console.log (err)
    const reciviedData = await getData(globalUrl)
    await writeFile(globalPatch, JSON.stringify(reciviedData), 'utf-8')
    return reciviedData
   })
   res.json(usersList)
})

const writeNewFile = (finalArray) => {
  return writeFile(globalPatch, JSON.stringify(finalArray), 'utf-8')
}

server.delete('/api/v1/users/', (req, res) => {
  unlink(globalPatch)
    .then(() => {
      res.json({ status: 'File deleted'})
    })
    .catch((err) => {
      console.log('Error: ', err)
      res.json({ status: 'No file' })
    })
  })

  server.post('/api/v1/users', async (req, res) => {
    const resposne = await readFile(globalPatch, 'utf-8')
      .then(async (str) => {
        const parsedString = JSON.parse(str)
        const lastId = parsedString[parsedString.length - 1].id + 1
        await writeNewFile([...parsedString, { ... req.body, id: lastId}])
        return { status: 'success', id: lastId }
      })
      .catch(async (err) => {
        console.log(err)
        await writeFile(globalPatch, JSON.stringify([{ ...req.body, id:1 }]), 'utf-8')
        return {status: 'success', id: 1}
      })
      res.json(response)
    })


    server.delete('/api/v1/users/:userId', async (req, res) => {
      const response1 = await readFile(globalPatch, 'utf-8')
        .then(async (str) => {
          const parsedString = JSON.parse(str)
          const filteredUsers = parsedString.filter((user) => {
            return +req.params.userId !== user.id
          })
          await writeNewFile(filteredUsers)
          return { status: 'success', id: +req.params.userId }
        })
        .catch(() => {
          return { status: 'no file exist', id: +req.params.userId }
        })
      res.json(response1)
    })


     server.patch('/api/v1/users/:userId', async (req, res) => {
       const { userId } = req.params
       const updatedUser = {...req.body, i: +userId}
       const response2 = await readFile(globalPatch, 'utf-8')
         .then(async (str) => {
           const parsedString = JSON.parse(str)
           const updatedlist = parsedString.map((obj) => {
             return obj.id === +userId ? {...obj, ...updatedUser} : obj
           })
           await writeNewFile(updatedlist)
           return { status: 'success', id: +userId }
         })
         .catch(() => {
           return { status: 'no file exist', id: +userId }
         })
       res.json(response2)
     })



server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
