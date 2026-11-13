type Token={kind:'number'|'name'|'symbol';value:string};
const functions:Record<string,(...values:number[])=>number>={
  abs:Math.abs,cos:Math.cos,exp:Math.exp,log:Math.log,max:Math.max,min:Math.min,sin:Math.sin,sqrt:Math.sqrt,tan:Math.tan,
};

export function evaluateMath(source:string,variables:Record<string,number>={}):number|null {
  const tokens:Token[]=[];let offset=0;
  while(offset<source.length){
    const match=/\s*((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z_]\w*|[()+\-*/^,])/iy.exec(source.slice(offset));
    if(!match)return null;
    offset+=match[0].length;
    tokens.push({kind:/^(?:\d|\.)/.test(match[1])?'number':/^[a-zA-Z_]/.test(match[1])?'name':'symbol',value:match[1]});
    if(tokens.length>256)return null;
  }
  let at=0,depth=0;
  const take=(value?:string)=>{const token=tokens[at];if(!token||value&&token.value!==value)return null;at++;return token;};
  const primary=():number=>{
    if(++depth>32)throw Error();
    const token=take();if(!token)throw Error();
    let value:number;
    if(token.kind==='number')value=Number(token.value);
    else if(token.kind==='symbol'&&token.value==='('){value=expression();if(!take(')'))throw Error();}
    else if(token.kind==='name'){
      if(take('(')){
        const args:number[]=[];
        if(!take(')')){do{args.push(expression());if(take(')'))break;}while(take(','));if(tokens[at-1]?.value!==')')throw Error();}
        const fn=functions[token.value];if(!fn||args.length==0||args.some(arg=>!Number.isFinite(arg)))throw Error();value=fn(...args);
      }else if(token.value==='pi')value=Math.PI;
      else if(token.value==='e')value=Math.E;
      else {value=variables[token.value];if(typeof value!=='number')throw Error();}
    }else throw Error();
    depth--;return value;
  };
  const unary=():number=>{if(take('+'))return unary();if(take('-'))return -unary();return primary();};
  const power=():number=>{const left=unary();return take('^')?left**power():left;};
  const product=():number=>{let value=power();while(true){if(take('*'))value*=power();else if(take('/'))value/=power();else break;}return value;};
  const expression=():number=>{let value=product();while(true){if(take('+'))value+=product();else if(take('-'))value-=product();else break;}return value;};
  try{const value=expression();return at===tokens.length&&Number.isFinite(value)?value:null;}catch{return null;}
}
