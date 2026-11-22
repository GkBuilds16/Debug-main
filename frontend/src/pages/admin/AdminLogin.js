import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/Authcontext";

function AdminLogin() {

  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");

  const navigate = useNavigate();
  const { login } = useAuth();

  const loginAdmin = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const user = await login(email, password);
      if (user.role === "admin") {
        navigate("/admin/dashboard");
      }else{
        setError("This account does not have administrator access.");
      }

    }catch(message){
      setError(typeof message === "string" ? message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return(
    <div style={container}>

      <form style={box} onSubmit={loginAdmin}>

        <h2>Admin Login</h2>

        <label style={label}>Email
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          style={input}
        /></label>

        <label style={label}>Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          style={input}
        /></label>

        <button
          type="submit"
          style={btn}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        {error && <p role="alert" style={note}>{error}</p>}

      </form>

    </div>
  );

}

const container={
  height:"100vh",
  display:"flex",
  justifyContent:"center",
  alignItems:"center",
  background:"#0f0f12"
}

const box={
  background:"#1e1e2f",
  padding:"40px",
  borderRadius:"10px",
  width:"300px",
  textAlign:"center"
}

const input={
  width:"100%",
  padding:"10px",
  marginBottom:"15px",
  borderRadius:"5px",
  border:"1px solid #444",
  background:"#0f0f12",
  color:"white"
}

const btn={
  width:"100%",
  padding:"10px",
  background:"#8b5cf6",
  color:"white",
  border:"none",
  borderRadius:"5px",
  cursor:"pointer"
}

const note={
  marginTop:"15px",
  fontSize:"12px",
  color:"#aaa"
}

const label={
  display:"block",
  textAlign:"left",
  color:"#aaa",
  marginBottom:"12px"
}

export default AdminLogin;
