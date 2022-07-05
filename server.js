const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const http = require('http')
const express = require('express')
const { Server } = require('socket.io')
const mysql = require('mysql')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const defaultState = require('./defaultState.json')

const PORT = process.env.PORT || 5555
const lobbyCodeLength = 8
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
            io.to(lobbyCode).emit('update players list', Object.values(gameStates[lobbyCode].nicknames))
            socket.emit('send lobby code', lobbyCode)
            console.log(`user ${socket.id} joined lobby: ${lobbyCode}`)
        }
    })

    socket.on('create lobby', nickname => {
        let x
        do {
            x = createLobbyCode(lobbyCodeLength)
        } while(gameStates.hasOwnProperty(x))
        const lobbyCode = x
        initGameState(lobbyCode, socket.id)
        gameStates[lobbyCode].nicknames[socket.id] = nickname

        console.log(`user ${socket.id} created lobby: ${lobbyCode}`)
        
        socket.join(lobbyCode)
        socket.emit('update players list', Object.values(gameStates[lobbyCode].nicknames))
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
                io.to(element).emit('cards update', state.playersCards[element], false)
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
            }
            if(gameStates[lobbyCode].deckCards.length) {
                gameStates[lobbyCode].playersCards[socket.id].push(gameStates[lobbyCode].deckCards.shift())
            }
            socket.emit('cards update', gameStates[lobbyCode].playersCards[socket.id], isMovePossible(lobbyCode, gameStates[lobbyCode].playersCards[socket.id][gameStates[lobbyCode].playersCards[socket.id].length - 1]))
            if(!isMovePossible(lobbyCode, gameStates[lobbyCode].playersCards[socket.id][gameStates[lobbyCode].playersCards[socket.id].length - 1])) {
                if(gameStates[lobbyCode].penalty > 0) {
                    while(--gameStates[lobbyCode].penalty > 0) {
                        if(!gameStates[lobbyCode].deckCards.length) {
                            for(let i = 0; i < gameStates[lobbyCode].discardPile.length - 1; i++) {
                                gameStates[lobbyCode].deckCards.push(gameStates[lobbyCode].discardPile.shift())
                            }
                        }
                        if(gameStates[lobbyCode].deckCards.length) {
                            gameStates[lobbyCode].playersCards[socket.id].push(gameStates[lobbyCode].deckCards.shift())
                        }
                    }
                }
                gameStates[lobbyCode].penalty = 0
                nextTurn(lobbyCode)
            }
            gameUpdate(lobbyCode)
        }
    })

    socket.on('drawn card option', (lobbyCode, isDrawnCardPlayed, optionalColor) => {
        if(isTurn(lobbyCode, socket.id)) {
            if(isDrawnCardPlayed) {
                playDrawnCard(socket, lobbyCode, gameStates[lobbyCode].playersCards[socket.id].length - 1, optionalColor)
            }
            else {
                if(gameStates[lobbyCode].penalty > 0) {
                    while(--gameStates[lobbyCode].penalty > 0) {
                        if(!gameStates[lobbyCode].deckCards.length) {
                            for(let i = 0; i < gameStates[lobbyCode].discardPile.length - 1; i++) {
                                gameStates[lobbyCode].deckCards.push(gameStates[lobbyCode].discardPile.shift())
                            }
                        }
                        if(gameStates[lobbyCode].deckCards.length) {
                            gameStates[lobbyCode].playersCards[socket.id].push(gameStates[lobbyCode].deckCards.shift())
                        }
                    }
                }
                gameStates[lobbyCode].penalty = 0
                socket.emit('cards update', gameStates[lobbyCode].playersCards[socket.id], false)
                nextTurn(lobbyCode)
                gameUpdate(lobbyCode)
            }
        }
    })

    socket.on('play card', (lobbyCode, i, optionalColor) => {
        if(isTurn(lobbyCode, socket.id)) {
            if(isMovePossible(lobbyCode, gameStates[lobbyCode].playersCards[socket.id][i])) {
                if(gameStates[lobbyCode].playersCards[socket.id][i].symbol == "wild" || gameStates[lobbyCode].playersCards[socket.id][i].symbol == "wilddraw") gameStates[lobbyCode].playersCards[socket.id][i].color = optionalColor
                gameStates[lobbyCode].discardPile.push(gameStates[lobbyCode].playersCards[socket.id][i])
                gameStates[lobbyCode].playersCards[socket.id].splice(i, 1)
                socket.emit('cards update', gameStates[lobbyCode].playersCards[socket.id], false)
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
            io.to(soc).emit('cards update', gameStates[lobbyCode].playersCards[soc], false)
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

    socket.on('disconnecting', () => {
        socket.rooms.forEach(room => {
            if (gameStates.hasOwnProperty(room)) {
                io.to(room).emit('update players list', Object.values(gameStates[room].nicknames).filter(item => item !== gameStates[room].nicknames[socket.id]))
                delete gameStates[room].nicknames[socket.id]
            }
        })
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

function playDrawnCard(someSocket, lobbyCode, i, optionalColor) {
    if(isTurn(lobbyCode, someSocket.id)) {
        if(isMovePossible(lobbyCode, gameStates[lobbyCode].playersCards[someSocket.id][i], true)) {
            if(gameStates[lobbyCode].playersCards[someSocket.id][i].symbol == "wild" || gameStates[lobbyCode].playersCards[someSocket.id][i].symbol == "wilddraw") gameStates[lobbyCode].playersCards[someSocket.id][i].color = optionalColor
            gameStates[lobbyCode].discardPile.push(gameStates[lobbyCode].playersCards[someSocket.id][i])
            gameStates[lobbyCode].playersCards[someSocket.id].splice(i, 1)
            someSocket.emit('cards update', gameStates[lobbyCode].playersCards[someSocket.id], false)
            cardEffect(lobbyCode)
            nextTurn(lobbyCode)
            gameUpdate(lobbyCode)
            if(gameStates[lobbyCode].playersCards[someSocket.id].length == 0) {
                io.sockets.adapter.rooms.get(lobbyCode).forEach(element => {
                    io.to(element).emit('game over', gameStates[lobbyCode].nicknames[someSocket.id], element == gameStates[lobbyCode].host ? true : false)
                })
            }
        }
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
        discardPile: gameStates[lobbyCode].discardPile[gameStates[lobbyCode].discardPile.length - 1],
        isPenalty: gameStates[lobbyCode].penalty > 0 ? true : false
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

function isMovePossible(lobbyCode, card, isCardDrawn) {
    const state = gameStates[lobbyCode]
    const card2 = state.discardPile[state.discardPile.length - 1]
    if(card.symbol == card2.symbol) {
        if(state.penalty > 0) {
            if(isCardDrawn) return true
            if(state.specialRules.stackingCards) return true
            if(state.specialRules.jumpIn && card.color == card2.color) return true 
            return false
        }
    }
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
    newState.deckCards = JSON.parse(JSON.stringify(defaultState.deckCards))
    newState.discardPile = []
    newState.direction = 1
    newState.penalty = 0
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

const mod = (n, m) => (n % m + m) % m