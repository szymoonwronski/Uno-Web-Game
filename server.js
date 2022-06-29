const path = require('path')
const _ = require('lodash')
const http = require('http')
const express = require('express')
const { Server } = require('socket.io')
const mysql = require('mysql')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const defaultState = (require('./defaultState.json'))

const PORT = 5555
const lobbyCodeLength = 5
const maxNumberOfPlayers = 4

let gameStates = {}

app.use(express.static('public'))

server.listen(PORT, () => console.log(`server is running... http://localhost:${PORT}`))

io.on('connection', socket => {
    console.log(`connected: ${socket.id}`)

    socket.on('join lobby', (lobbyCode, nickname) => {
        if(!io.sockets.adapter.rooms.has(lobbyCode)) console.log(`user ${socket.id} tried to join null lobby: ${lobbyCode}`)
        else if(io.sockets.adapter.rooms.get(lobbyCode).size == maxNumberOfPlayers) console.log(`user ${socket.id} tried to join full lobby: ${lobbyCode}`)
        else {
            socket.join(lobbyCode)
            gameStates[lobbyCode].nicknames[socket.id] = nickname
            console.log(`user ${socket.id} joined lobby: ${lobbyCode}`)
        }
    })

    socket.on('create lobby', nickname => {
        const lobbyCode = createLobbyCode(lobbyCodeLength)
        initGameState(lobbyCode, socket.id)
        gameStates[lobbyCode].nicknames[socket.id] = nickname

        console.log(`user ${socket.id} created lobby: ${lobbyCode}`)
        
        socket.join(lobbyCode)
        socket.emit('send lobby code', lobbyCode)
    })

    socket.on('start game', (lobbyCode, lobbySettings) => {
        if(io.sockets.adapter.rooms.has(lobbyCode) && 2 <= io.sockets.adapter.rooms.get(lobbyCode).size && io.sockets.adapter.rooms.get(lobbyCode).size <= maxNumberOfPlayers && socket.id == gameStates[lobbyCode].host) {
            let state = createGameState(lobbyCode, lobbySettings, socket.id)
            shuffleCards(state)
            io.sockets.adapter.rooms.get(lobbyCode).forEach(element => {
                state.playersUnos[element] = false
                state.playersCards[element] = []
                for(let j = 0; j < 7; j++) {
                    state.playersCards[element].push(state.deckCards.shift())
                }
                io.to(element).emit('game started', Object.values(gameStates[lobbyCode].nicknames), lobbySettings, Object.keys(gameStates[lobbyCode].playersCards).indexOf(element))
                io.to(element).emit('cards update', state.playersCards[element])
            })

            gameStates[lobbyCode] = JSON.parse(JSON.stringify(state))

            console.log(`host ${socket.id} started lobby: ${lobbyCode}`)

            gameUpdate(lobbyCode)
        }
    })

    socket.on('draw card', lobbyCode => {
        if(isTurn(lobbyCode, socket.id)) {
            if(!gameStates[lobbyCode].deckCards.length) {
                for(let i = 0; i < gameStates[lobbyCode].discardPile.length - 1; i++) {
                    gameStates[lobbyCode].deckCards.push(gameStates[lobbyCode].discardPile.shift())
                }
                if(gameStates[lobbyCode].deckCards.length) {
                    gameStates[lobbyCode].playersCards[socket.id].push(gameStates[lobbyCode].deckCards.shift())
                }
            }
            else {
                gameStates[lobbyCode].playersCards[socket.id].push(gameStates[lobbyCode].deckCards.shift())
            }
            socket.emit('cards update', gameStates[lobbyCode].playersCards[socket.id])
            nextTurn(lobbyCode)
            gameUpdate(lobbyCode)
        }
    })

    socket.on('play card', (lobbyCode, i) => {
        if(isTurn(lobbyCode, socket.id)) {
            if(isMovePossible(gameStates[lobbyCode].playersCards[socket.id][i])) {
                gameStates[lobbyCode].discardPile.push(gameStates[lobbyCode].playersCards[socket.id][i])
                gameStates[lobbyCode].playersCards[socket.id].splice(i, 1)
                socket.emit('cards update', gameStates[lobbyCode].playersCards[socket.id])
                cardEffect(lobbyCode)
                nextTurn(lobbyCode)
                gameUpdate(lobbyCode)
                if(gameStates[lobbyCode].playersCards[socket.id].length == 0) {
                    io.sockets.adapter.rooms.get(lobbyCode).forEach(element => {
                        io.to(element).emit('game over', gameStates[lobbyCode].nicknames[socket.id], element == gameStates[lobbyCode].host ? true : false)
                    })
                }
            }
        }
    })

    socket.on('challenge uno', (lobbyCode, i) => {
        const soc = Object.keys(gameStates[lobbyCode].playersCards)[i]
        if(gameStates[lobbyCode].playersCards[soc].length == 1 && gameStates[lobbyCode].playersUnos[soc] == true) {
            for(let j = 0; j < 2; j++) {
                if(!gameStates[lobbyCode].deckCards.length) {
                    for(let k = 0; k < gameStates[lobbyCode].discardPile.length - 1; k++) {
                        gameStates[lobbyCode].deckCards.push(gameStates[lobbyCode].discardPile.shift())
                    }
                    if(gameStates[lobbyCode].deckCards.length) {
                        gameStates[lobbyCode].playersCards[soc].push(gameStates[lobbyCode].deckCards.shift())
                    }
                }
                else {
                    gameStates[lobbyCode].playersCards[soc].push(gameStates[lobbyCode].deckCards.shift())
                }
            }
            io.to(soc).emit('cards update', gameStates[lobbyCode].playersCards[soc])
            gameUpdate(lobbyCode)
        }
    })

    socket.on('call uno', lobbyCode => {
        gameStates[lobbyCode].playersUnos[socket.id] = 'called'
        gameUpdate(lobbyCode)
    })

    socket.on('play again', lobbyCode => {
        io.to(lobbyCode).emit('reset all')
    })

    socket.on('disconnect', () => console.log(`disconnected: ${socket.id}`))
})

function cardEffect(lobbyCode) {
    const card = gameStates[lobbyCode].discardPile[gameStates[lobbyCode].discardPile.length - 1]
    switch(card.symbol) {
        case 'skip':
            nextTurn(lobbyCode)
            break
        case 'reverse':
            gameStates[lobbyCode].direction = gameStates[lobbyCode].direction == 1 ? -1 : 1 
            break
        case 'draw':
            gameStates[lobbyCode].penalty = parseInt(gameStates[lobbyCode].penalty) + 2
            break
    }
}

function gameUpdate(lobbyCode) {
    let numberOfPlayersCards = []
    Object.values(gameStates[lobbyCode].playersCards).forEach(element => {
        numberOfPlayersCards.push(element.length)
    })
    io.sockets.adapter.rooms.get(lobbyCode).forEach(element => {
        if(gameStates[lobbyCode].playersCards[element].length == 1 && gameStates[lobbyCode].playersUnos[element] == false) gameStates[lobbyCode].playersUnos[element] = true
        else if(gameStates[lobbyCode].playersCards[element].length > 1) gameStates[lobbyCode].playersUnos[element] = false
    })

    const gameInfo = {
        turn: Object.keys(gameStates[lobbyCode].nicknames).indexOf(gameStates[lobbyCode].turn),
        numberOfPlayersCards: numberOfPlayersCards,
        playersUnos: Object.values(gameStates[lobbyCode].playersUnos),
        discardPile: gameStates[lobbyCode].discardPile[gameStates[lobbyCode].discardPile.length - 1]
    }
    io.to(lobbyCode).emit('game update', gameInfo)
}

function isTurn(lobbyCode, socketId) {
    return socketId == gameStates[lobbyCode].turn ? true : false;
}

function nextTurn(lobbyCode) {
    const ids = Object.keys(gameStates[lobbyCode].playersCards)
    gameStates[lobbyCode].turn = ids[mod(ids.indexOf(gameStates[lobbyCode].turn) + Number(gameStates[lobbyCode].direction), gameStates[lobbyCode].numberOfPlayers)]
}

function isMovePossible(card) {
    return true
}

function initGameState(lobbyCode, hostId) {
    let state = JSON.parse(JSON.stringify(defaultState))
    state.host = hostId
    state.turn = hostId
    gameStates[lobbyCode] = JSON.parse(JSON.stringify(state))
}

function createGameState(lobbyCode, lobbySettings) {
    var newState = gameStates[lobbyCode]
    newState.numberOfPlayers = io.sockets.adapter.rooms.get(lobbyCode).size
    newState.specialRules.sevenZero = lobbySettings.sevenZero
    newState.specialRules.stackingCards = lobbySettings.stackingCards
    newState.specialRules.jumpIn = lobbySettings.jumpIn
    return newState
}

function shuffleCards(state) {
    state.deckCards = _.shuffle(state.deckCards)
    state.discardPile.push(state.deckCards.shift())
}

function createLobbyCode(length) {
    var result = ''
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
}

const mod = (n, m) => (n % m + m) % m;