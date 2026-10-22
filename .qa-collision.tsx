import React from 'react';
import {createRoot} from 'react-dom/client';
import './src/index.css';
import Sheet from './src/components/NifCollisionSheet';
const root=createRoot(document.getElementById('root')!);
root.render(<Sheet matches={[{id:'existing',nif:'517842494',name:'MARINA - STP, LIMITADA',address:'Ponta Mina',district:'',contact:'',email:'',type:'',representant:''}]} onChoose={decision=>root.render(<p>{decision?.action||'cancelled'}</p>)} />);
