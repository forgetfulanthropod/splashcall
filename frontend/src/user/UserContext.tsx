import React, { useState, createContext, useEffect } from 'react'
export const Con = createContext(null)

type Children = JSX.Element[] | JSX.Element
export default function UserContext({ children }: { children: Children }): JSX.Element {
    const [isLoggedIn, setisLoggedIn] = useState(false)
    const [contacts, setContacts] = useState(null)
    const [userIcon, setuserIcon] = useState(null)

    useEffect(() => {
        setisLoggedIn(true)
        setContacts([
            {
                name: 'mom',
                id: '1234',
                color: 'blue',
                image: null,
            },
        ])
        setuserIcon(null)
    }, []) // will depend on stuff here later


    return <Con.Provider value={{
        isLoggedIn,
        contacts,
        userIcon,
    }}>
        {children}
    </Con.Provider>
}
