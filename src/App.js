import React from 'react';
import Welcome from './welcome';
import Clock from './Clock';

function App() {
  return (
    <div className="App">
      <Welcome name="Man" />
      
      <Clock />
    </div>
  );
}

export default App;