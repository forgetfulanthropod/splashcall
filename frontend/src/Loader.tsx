import React from 'react'
import { useAppContext } from './context'
import styles from './loader.module.css'
export default function Loader(): JSX.Element {
    const { aspect: { screenInfo } } = useAppContext()
    return <div className={styles.loadingContainer} style={{ width: screenInfo.width, height: screenInfo.height }}>
        <div className={styles['lds-ring']}><div></div><div></div><div></div><div></div></div>
    </div>
}
