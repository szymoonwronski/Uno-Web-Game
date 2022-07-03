const socket = io()

const divPreGame = document.getElementById('pre-game')
const divMainGame = document.getElementById('main-game')
const divPostGame = document.getElementById('post-game')

const divScreen1 = document.getElementById('screen1')
const divScreen2 = document.getElementById('screen2')

const settingsSevenZero = document.getElementById('create-lobby-settings-seven-zero')
const settingsStackingCards = document.getElementById('create-lobby-settings-stackingcards')
const settingsJumpIn = document.getElementById('create-lobby-settings-jumpin')
const playerNicknameInput = document.getElementById('player-nickname-input')
const createLobbyButton = document.getElementById('create-lobby-button')
const joinLobbyInput = document.getElementById('join-lobby-input')
const joinLobbyButton = document.getElementById('join-lobby-button')
const startGameButton = document.getElementById('start-game-button')
const showLobbyCode = document.getElementById('show-lobby-code')

const drawCardButton = document.getElementById('draw-card-button')
const callUnoButton = document.getElementById('call-uno-button')
const challengeUnoButton = document.getElementById('challenge-uno-button')

const playAgainButton = document.getElementById('play-again-button')

let lobbyCode // code of the game
let nickname // visible nickname of this user
let nicknames // array of users nicknames in lobby
let nicknameId // id of this user in "nicknames" array
let gameInfo // all of the information of the game
let gameSettings // settings of current game - rules
let myCards // array of this user cards
let playersListSpans // array of spans where nicknames are visible

playAgainButton.onclick = () => {
    socket.emit('play again', lobbyCode)
    socket.emit('start game', lobbyCode, gameSettings)
}

callUnoButton.onclick = () => {
    socket.emit('call uno', lobbyCode)
}

drawCardButton.onclick = () => {
    socket.emit('draw card', lobbyCode)
}

createLobbyButton.onclick = () => {
    divScreen1.style.display = 'none'
    divScreen2.style.display = 'block'
    nickname = playerNicknameInput.value
    socket.emit('create lobby', nickname)
}

joinLobbyButton.onclick = () => {
    lobbyCode = joinLobbyInput.value
    nickname = playerNicknameInput.value
    socket.emit('join lobby', lobbyCode, nickname)
}

startGameButton.onclick = () => {
    const lobbySettings = {
        sevenZero: settingsSevenZero.checked ? true : false,
        stackingCards: settingsStackingCards.checked ? true : false,
        jumpIn: settingsJumpIn.checked ? true : false
    }
    socket.emit('start game', lobbyCode, lobbySettings)
}

socket.on('send lobby code', code => {
    divScreen1.style.display = 'none'
    divScreen2.style.display = 'block'
    lobbyCode = code
    showLobbyCode.innerHTML += lobbyCode
})

socket.on('game started', (nicks, settings, nickId)  => {
    divPreGame.style.display = "none"
    divPostGame.style.display = 'none'
    divMainGame.style.display = "block"
    if(!Object.is(settings, undefined)) gameSettings = settings
    if(!Object.is(nicks, undefined)) {
        nicknames = nicks
        nicknameId = nickId
        nicknames.forEach(() => {
            let span = document.createElement('span')
            span.classList.add('players-list-component')
            divMainGame.appendChild(span)
        })
    }
})

socket.on('cards update', (cards, isDrawnCardPossibleToPlay) => {
    const drawnCardButtons = Array.from(document.getElementsByClassName('drawn-card-option'))
    drawnCardButtons.forEach(element => element.remove())
    myCards = cards
    if(isDrawnCardPossibleToPlay) {
        let keepCardButton = document.createElement('input')
        let playCardButton = document.createElement('input')
        keepCardButton.type = 'button'
        playCardButton.type = 'button'
        keepCardButton.value = 'Keep'
        playCardButton.value = 'Play'
        keepCardButton.classList.add('drawn-card-option')
        playCardButton.classList.add('drawn-card-option')
        divMainGame.appendChild(keepCardButton);
        divMainGame.appendChild(playCardButton);
        keepCardButton.onclick = () => {
            socket.emit('drawn card option', lobbyCode, false)
        }
        playCardButton.onclick = () => {
            socket.emit('drawn card option', lobbyCode, true)
        }
    }
})

socket.on('game update', info => {
    gameInfo = info

    challengeUnoButton.style.display = 'none'
    for(let i = 0; i < gameInfo.playersUnos.length; i++) {
        if(gameInfo.playersUnos[i] == true && i != nicknameId) {
            challengeUnoButton.style.display = 'block'
            challengeUnoButton.onclick = () => {
                socket.emit('challenge uno', lobbyCode, i)
            }
        }
    }

    callUnoButton.style.display = 'none'
    if(myCards.length == 1 && gameInfo.playersUnos[nicknameId] == true) callUnoButton.style.display = 'block'

    showEverything()
})

socket.on('reset all', () => {
    const elementsToRemove = Array.from(document.getElementsByClassName('temporary-for-game'))
    elementsToRemove.forEach(element => element.remove())
})

socket.on('game over', (winner, makePlayAgainButtonVisible) => {
    divMainGame.style.display = 'none'
    divPostGame.style.display = 'block'
    if(makePlayAgainButtonVisible) playAgainButton.style.display = 'block'
})

function showEverything() {
    showCards()
    showPlayers()
}

function showCards() {
    const myCardsButtons = Array.from(document.getElementsByClassName('card'))
    myCardsButtons.forEach(card => card.remove())

    let discardPileCard = document.createElement("img");
    discardPileCard.src = `/images/cards/${gameInfo.discardPile.color}${gameInfo.discardPile.symbol}.png`;
    discardPileCard.style.width = "40px"
    discardPileCard.style.height = "60px"
    discardPileCard.classList.add('card')
    discardPileCard.classList.add('temporary-for-game')
    divMainGame.appendChild(discardPileCard);

    for(let i = 0; i < myCards.length; i++) {
        let btn = document.createElement('input')
        btn.type = 'image'
        btn.classList.add('card')
        btn.classList.add('temporary-for-game')
        const fileName = myCards[i].color + myCards[i].symbol
        btn.src = `/images/cards/${fileName}.png`
        btn.onclick = () => {
            if(isMovePossible(myCards[i])) {
                socket.emit('play card', lobbyCode, i)
            }
        }
        divMainGame.appendChild(btn)
    }
}

function showPlayers() {
    for(let i = 0; i < nicknames.length; i++) {
        let span = Array.from(document.getElementsByClassName('players-list-component'))[i]
        span.innerHTML = `${nicknames[i]}: ${gameInfo.numberOfPlayersCards[i]}`
        if(gameInfo.turn == i) span.style.fontWeight = 'bold'
        else span.style.fontWeight = 'normal'
    }
}

function isMovePossible(card) {
    return true
}