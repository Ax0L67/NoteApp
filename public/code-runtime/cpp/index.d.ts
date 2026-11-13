import Clang from "./clang.js";
import LLD from "./lld.js";
export { Clang, LLD };
export type FileList = {
    [fileName: string]: string | ArrayBuffer;
};
export type CompilationJob = {
    source: string;
    fileName: string;
    flags: string[];
    extraFiles?: FileList;
};
export type CompilationResult = {
    compileOutput: string;
    module: WebAssembly.Module | null;
};
export type Invocation = {
    compilerArgs: string[];
    compilerArtifact: string;
    linkerArgs: string[];
    linerArtifact: string;
};
export declare function tarContents(contents: ArrayBuffer): Generator<{
    name: string;
    content: Uint8Array;
}>;
export declare function setUpSysroot(module: any, tar: ArrayBuffer, extraFiles?: FileList): void;
export declare function getCompilerInvocation(inputName: string, inputFile: string, flags: string[]): Promise<Invocation>;
export declare function compile({ source, fileName, flags, extraFiles, }: CompilationJob): Promise<CompilationResult>;
export declare const getPrecompiledHeader: (flags: string[]) => Promise<ArrayBuffer>;
