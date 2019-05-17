
import Navbar from './Navbar';
import { Container } from 'reactstrap'
import * as React from 'react';
import Footer from './Footer'



const Layout = ( props: any ) => (

    <div>
        <Navbar counter={props.counter} />
        <Container>

            <div className="tab-content">

                {props.children}
            </div>

        </Container>

    </div>

)

export default Layout;