
import Navbar from './Navbar';
import { Container } from 'reactstrap'
import React from 'react'



const Layout = (props) => (

    <div>
        <Navbar counter={props.counter}/>
        <Container>
        
         {props.children}

       
        </Container>
    </div>

)

export default Layout;