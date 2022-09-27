const email = document.querySelector('.index-email')
const password = document.querySelector('.indexPassword')
const submitButton = document.querySelector('.indexButton')

submitButton.addEventListener(click, submitForm)

async function submitForm(){
    const userEmail = email.value
    const userPassword = password.value

    const response = await fetch('/login', {method: POST})

}